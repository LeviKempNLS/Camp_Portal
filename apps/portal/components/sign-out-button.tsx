"use client";
import { authClient } from "@faith-adventures/auth/client";
import { useRouter } from "next/navigation";
export function SignOutButton(){const router=useRouter();return <button onClick={async()=>{await authClient.signOut();router.replace("/sign-in");}}>Sign out</button>;}
