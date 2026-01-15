"use client";
import { SignedIn, SignedOut, RedirectToSignIn, useUser } from "@clerk/nextjs";
import { TopNav } from "../../components/TopNav";
import { BottomNav } from "../../components/BottomNav";
import { PostClassNudgeBanner } from "../../components/PostClassNudgeBanner";
import { AssignmentSuccessBanner } from "../../components/AssignmentSuccessBanner";
import { OneSignalInit } from "../../components/OneSignalInit";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  return (
    <>
      <SignedIn>
        <OneSignalInit />
        <div className="flex flex-col min-h-screen">
        <TopNav />
          <div className="flex-1 pb-24 md:pb-0">
        {children}
          </div>
          <BottomNav />
        </div>
        {/* Post-class nudge banner */}
        {user && <PostClassNudgeBanner userId={user.id} />}
        {/* Assignment success notification */}
        <AssignmentSuccessBanner />
      </SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}
