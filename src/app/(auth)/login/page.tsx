"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, TrendingUp, Loader2 } from "lucide-react";
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
import { loginSchema, type LoginFormData } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n";
import {
  saveOfflineAuthSession,
  saveRememberedLogin,
  verifyRememberedLogin,
} from "@/lib/offline/auth-cache";

// Supabase's client retries certain failure classes (like a fully
// unreachable network) internally with its own backoff before finally
// rejecting — that can take 20-30s, which is much too long to leave a
// cashier staring at a spinner before falling back to the cached offline
// login. Bound the wait; if it's exceeded, treat it the same as a
// network failure (the abandoned real request has no side effects since
// it never reached "success").
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Sign-in timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const SIGN_IN_TIMEOUT_MS = 6000;

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    // Default to on: this is a dedicated POS terminal, not a shared
    // public kiosk, and offline sign-in is a core requirement (per the
    // offline-first design), not an opt-in extra. A cashier can still
    // uncheck it for a genuinely shared/public device.
    defaultValues: { remember: true },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    // Shared fallback: try the cached "remembered" offline credential.
    // Returns true if it succeeded (and has already navigated away).
    const tryOfflineFallback = async (): Promise<boolean> => {
      const rememberedProfile = await verifyRememberedLogin(
        data.email,
        data.password,
      );
      if (!rememberedProfile) return false;

      saveOfflineAuthSession(data.email, rememberedProfile);
      toast.success(t.auth.sign_in_success);
      router.push("/dashboard");
      router.refresh();
      return true;
    };

    try {
      // Fast path: the browser already knows there's no network at all
      // (no interfaces up), so don't even attempt — and definitely don't
      // wait through Supabase's internal retry/backoff — before falling
      // back to the offline cache.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (await tryOfflineFallback()) return;
        toast.error(t.auth.invalid_credentials);
        return;
      }

      const supabase = createClient();
      const { error, data: authData } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        }),
        SIGN_IN_TIMEOUT_MS,
      );

      if (error) {
        if (await tryOfflineFallback()) return;
        toast.error(error.message || t.auth.invalid_credentials);
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
        if (data.remember) {
          await saveRememberedLogin(data.email, data.password, profile);
        }
      }

      toast.success(t.auth.sign_in_success);
      // Forced first-login password-change gate (e.g. a merchant's
      // business_owner created via /api/merchants/onboard with a
      // temporary password) — send them straight to /change-password
      // instead of bouncing through /dashboard first.
      if (
        profile &&
        (profile as Record<string, unknown>).must_change_password
      ) {
        router.push("/change-password");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      // Network fully unreachable, or the sign-in attempt above hit
      // SIGN_IN_TIMEOUT_MS — either way, fall back to the cached login.
      if (await tryOfflineFallback()) return;
      toast.error(t.auth.unexpected_error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-lg mb-4">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">TradeTrack</h1>
          <p className="text-muted-foreground mt-1">{t.auth.tagline}</p>
        </div>

        <Card className="shadow-xl border-0 bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">{t.auth.welcome_back}</CardTitle>
            <CardDescription>{t.auth.sign_in_subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t.auth.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@demo.com"
                  {...register("email")}
                  error={errors.email?.message}
                  disabled={isLoading}
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t.auth.password}</Label>

                  <a
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    {t.auth.forgot_password}
                  </a>
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
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

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <input
                  id="remember"
                  type="checkbox"
                  {...register("remember")}
                  className="rounded border-input"
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal cursor-pointer"
                >
                  {t.auth.remember_me_30_days}
                </Label>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-10"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t.auth.signing_in}
                  </>
                ) : (
                  t.auth.sign_in
                )}
              </Button>
            </form>

            {/* Demo credentials - development only, never shown in production */}
            {process.env.NODE_ENV !== "production" && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t.auth.demo_credentials_label}
                </p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium">
                      {t.auth.role_platform_owner}:
                    </span>{" "}
                    platformowner@tradetrack.ng / demo1234
                  </p>
                  <p>
                    <span className="font-medium">
                      {t.auth.role_business_owner}:
                    </span>{" "}
                    owner@demo.com / demo1234
                  </p>
                  <p>
                    <span className="font-medium">{t.auth.role_admin}:</span>{" "}
                    admin@demo.com / demo1234
                  </p>
                  <p>
                    <span className="font-medium">{t.auth.role_cashier}:</span>{" "}
                    cashier@demo.com / demo1234
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {t.auth.copyright}
        </p>
      </div>
    </div>
  );
}
