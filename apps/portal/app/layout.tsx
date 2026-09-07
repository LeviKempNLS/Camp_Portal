import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = { title: "Faith Adventures Camp Portal", description: "Registration and camp operations" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
