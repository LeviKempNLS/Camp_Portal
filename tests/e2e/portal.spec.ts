import { test, expect, type Page } from "@playwright/test";

function identity(prefix: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { name: "Playwright Guardian", email: `${prefix}.${suffix}@example.test`, password: "Fictitious-Playwright-Password-123!" };
}

async function signUp(page: Page) {
  const user = identity("playwright.guardian");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).first().click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create demo account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return user;
}

async function addCamper(page: Page, firstName: string) {
  await page.goto("/household/members/new");
  await page.getByLabel("Member type").selectOption("camper");
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill("Camper");
  await page.getByLabel("Date of birth").fill("2017-06-15");
  await page.getByLabel(/Grade just completed/).fill("3");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByRole("heading", { name: `${firstName} Camper` })).toBeVisible();
}

test("signed-out navigation exposes account creation and protected pages require authentication", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await page.goto("/household");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("guardian can sign up, edit household, add camper, navigate member pages, and sign out", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create account" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Household", exact: true }).click();
  await expect(page.getByRole("link", { name: "Edit household" })).toBeVisible();
  await page.getByRole("link", { name: "Edit household" }).click();
  await page.getByLabel("Household name").fill("Playwright Test Household");
  await page.getByLabel("Street").fill("123 Example Lane");
  await page.getByLabel("City").fill("Exampleville");
  await page.getByLabel("State").fill("MO");
  await page.getByLabel("Postal code").fill("00000");
  await page.getByRole("button", { name: "Save household" }).click();
  await expect(page.getByRole("status")).toContainText("Household details saved");
  await expect(page.getByRole("link", { name: "Edit household" })).toBeVisible();
  await expect(page.getByLabel("Household details")).toContainText("Playwright Test Household");

  await page.getByRole("link", { name: "Add household member" }).click();
  await page.getByLabel("Member type").selectOption("camper");
  await page.getByLabel("First name").fill("Pat");
  await page.getByLabel("Last name").fill("Camper");
  await page.getByLabel("Date of birth").fill("2017-06-15");
  await page.getByLabel(/Grade just completed/).fill("3");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByRole("status")).toContainText("Household member added");
  await expect(page.getByRole("heading", { name: "Pat Camper" })).toBeVisible();
  await expect(page.getByText("2017-06-15")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start or resume registration" })).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await page.goto("/household");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("guardian can submit a registration and submitted registration becomes read-only", async ({ page }) => {
  await signUp(page);
  await addCamper(page, "Submit");
  await page.getByRole("link", { name: "Start or resume registration" }).click();
  await expect(page).toHaveURL(/\/registrations\/new\?camperId=/);
  const registrationUrl = page.url();

  await page.getByLabel("Camp group").selectOption("jyf");
  await page.getByLabel("Camper T-shirt size").selectOption("Youth M");
  await page.getByRole("button", { name: "Save & continue" }).click();

  await expect(page.getByLabel("Camper full name")).toHaveValue("Submit Camper");
  await expect(page.getByLabel("Date of birth")).toHaveValue("2017-06-15");
  await expect(page.getByLabel("Grade just completed")).toHaveValue("3");
  await page.getByRole("button", { name: "Save & continue" }).click();

  await page.getByLabel("Best phone number").fill("555-0101");
  await page.getByLabel("Home address").fill("123 Example Lane, Exampleville, MO 00000");
  await page.getByLabel("Emergency contact name and phone").fill("Alex Example, 555-0102");
  await page.getByRole("button", { name: "Save & continue" }).click();

  await page.getByLabel("Medical insurance carrier and policy/group number").fill("Fictitious Carrier TEST-123");
  await page.getByLabel("Allergies and how to manage reactions").fill("No known allergies - fictitious test data");
  await page.getByRole("button", { name: "Save & continue" }).click();

  await page.getByLabel(/authorize routine and emergency health care/i).check();
  await page.getByLabel(/authorize transportation/i).check();
  await page.getByLabel(/authorize photography/i).check();
  await page.getByLabel(/agrees to the Faith Adventures Camp covenant/i).check();
  await page.getByRole("button", { name: "Submit registration" }).click();

  await expect(page.getByRole("heading", { name: /Thank you, Submit Camper!/ })).toBeVisible();
  await expect(page.getByText(/waiting for camp review/i)).toBeVisible();
  await page.goto(registrationUrl);
  await expect(page.getByRole("heading", { name: "Submit Camper" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: /^Submitted$/ })).toBeVisible();
  await expect(page.getByText(/waiting for review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit registration" })).toHaveCount(0);
});

test("guardian cannot access registrar tools", async ({ page }) => {
  await signUp(page);
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/registrar/i)).toHaveCount(0);
});
