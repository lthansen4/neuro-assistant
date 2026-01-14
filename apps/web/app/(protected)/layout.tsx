"use client";
import { SignedIn, SignedOut, RedirectToSignIn, useUser } from "@clerk/nextjs";
import { TopNav } from "../../components/TopNav";
import { PostClassNudgeBanner } from "../../components/PostClassNudgeBanner";
import { AssignmentSuccessBanner } from "../../components/AssignmentSuccessBanner";
import { OneSignalInit } from "../../components/OneSignalInit";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  return (
    <>
      <SignedIn>
        <OneSignalInit />
        <TopNav />
        {children}
        {/* Post-class nudge banner */}
        {user && <PostClassNudgeBanner userId={user.id} />}
        {/* Assignment success notification */}
        <AssignmentSuccessBanner />
      </SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}
