"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, TrendingUp, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { signupSchema, type SignupFormData } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";
import { saveOfflineAuthSession, saveRememberedLogin } from "@/lib/offline/auth-cache";

/**
 * Public self-serve signup page — reachable logged-out, no existing
 * account required. Accepts an optional `?plan=<subscription_plans.id>`
 * query param (set by the marketing Pricing page's "Get Started"/
 * "Start Free" CTAs) and forwards it to POST /api/auth/signup, which
 * creates a brand-new organization + business_owner account on that
 * plan (falling back to Free for missing/invalid/Enterprise plan ids —
 * see that route's own comments).
 *
 * After a successful signup, this page signs the new user straight in
 * client-side (same pattern as the login page: cache an offline auth
 * session, optionally remember credentials) and redirects to
 * /dashboard, rather than sending them back through /login separately.
 */
function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan") ?? undefined;

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { plan_id: planId },
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: data.business_name,
          full_name: data.full_name,
          email: data.email,
          password: data.password,
          phone: data.phone,
          plan_id: planId,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "Signup failed. Please try again.");
        return;
      }

      // Sign the new user in immediately so they land on /dashboard with
      // an active session, instead of bouncing them back through /login.
      const supabase = createClient();
      const { error: signInError, data: authData } =
        await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

      if (signInError) {
        // Account was created successfully even if the immediate sign-in
        // hiccups (e.g. flaky network right after signup) — send them to
        // /login instead of showing an error for something that actually
        // succeeded.
        toast.success("Account created! Please sign in.");
        router.push("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authData.user?.id)
        .single();
      const profile = (profileData ?? authData.user) as Record<
        string,
        unknown
      > | null;
      if (profile) {
        saveOfflineAuthSession(data.email, profile);
        await saveRememberedLogin(data.email, data.password, profile);
      }

      toast.success(
        result.plan?.name
          ? `Welcome to TradeTrack! You're on the ${result.plan.name} plan.`
          : "Welcome to TradeTrack!"
      );
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 py-10">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <a
            href="/"
            className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-lg mb-4"
          >
            <TrendingUp className="h-8 w-8 text-white" />
          </a>
          <h1 className="text-3xl font-bold text-foreground">TradeTrack</h1>
          <p className="text-muted-foreground mt-1">
            POS & Inventory that works offline
          </p>
        </div>

        <Card className="shadow-xl border-0 bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
              {planId
                ? "You're one step away from your selected plan."
                : "Start free — no card required."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_name">Business name</Label>
                <Input
                  id="business_name"
                  placeholder="e.g. Adaeze General Stores"
                  {...register("business_name")}
                  error={errors.business_name?.message}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">Your name</Label>
                <Input
                  id="full_name"
                  placeholder="e.g. Adaeze Okonkwo"
                  {...register("full_name")}
                  error={errors.full_name?.message}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@business.com"
                  {...register("email")}
                  error={errors.email?.message}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="080..."
                  {...register("phone")}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  {...register("password")}
                  error={errors.password?.message}
                  disabled={isLoading}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-0"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  {...register("confirmPassword")}
                  error={errors.confirmPassword?.message}
                  disabled={isLoading}
                />
              </div>

              {planId && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span>
                    Your selected plan will be applied to your new account
                    automatically after signup.
                  </span>
                </div>
              )}

              <Button type="submit" className="w-full h-10" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account?{" "}
              <a href="/login" className="text-primary hover:underline">
                Sign in
              </a>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} TradeTrack | Powered by CAXiE
          Technologies Ltd
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
