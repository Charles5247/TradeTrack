/* Auth screens — Login / Signup / Forgot / Reset / Change password.
 * All use the same split-panel shell with brand imagery on one side. */

function AuthShell({ children, direction, mode, onToggleMode, onNavigate, activeAuth }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "var(--c-bg)" }}>
      <div style={{ padding: 40, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div onClick={() => onNavigate("landing")} style={{ cursor: "pointer" }}>
            <Logo direction={direction} size={30} />
          </div>
          <button className="tt-btn tt-btn-ghost tt-btn-icon" onClick={onToggleMode}>
            {mode === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 420 }}>
            {children}
          </div>
        </div>
        <div className="tt-muted" style={{ fontSize: 12, textAlign: "center" }}>
          © 2026 TradeTrack Nigeria · <a style={{ color: "var(--c-textMuted)", textDecoration: "none", cursor: "pointer" }}>Privacy</a> · <a style={{ color: "var(--c-textMuted)", textDecoration: "none", cursor: "pointer" }}>Terms</a>
        </div>
      </div>

      <AuthPanel direction={direction} activeAuth={activeAuth} />
    </div>
  );
}

/* Right-side brand panel — direction-specific art */
function AuthPanel({ direction, activeAuth }) {
  const panels = {
    login: {
      quote: "Since we started using TradeTrack, stock-outs dropped 80%. And I finally trust my end-of-day totals.",
      who: "Amaka Onyeka",
      role: "Onyeka Provision Stores · Aba",
      stat: [{ n: "₦482,190", l: "Sold today · Aba shop" }, { n: "147", l: "Transactions" }, { n: "0", l: "Missed sales" }],
    },
    signup: {
      quote: "The onboarding took ten minutes. Then I got a Naira account for my shop, on the same day.",
      who: "Ibrahim Musa",
      role: "Musa Grains · Kano",
      stat: [{ n: "10 min", l: "Merchant onboarding" }, { n: "Auto", l: "Zainpay account" }, { n: "Free", l: "Forever plan" }],
    },
    forgot: {
      quote: "We recover accounts in seconds, not days. Because losing access can't cost you a sale.",
      who: "TradeTrack Security",
      role: "Recovery flow",
      stat: [{ n: "OTP", l: "Sent to your email" }, { n: "5 min", l: "Reset window" }, { n: "24/7", l: "Support" }],
    },
    change: {
      quote: "For your safety, please choose a strong password. This one time, you have to change from the temporary one.",
      who: "Business Owner onboarding",
      role: "Required first login step",
      stat: [{ n: "8+", l: "Characters minimum" }, { n: "One-time", l: "Change required" }, { n: "Secure", l: "Bcrypt hashed" }],
    },
  };
  const p = panels[activeAuth] || panels.login;
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "var(--c-primary)", color: "var(--c-primaryFg)", padding: 60, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div className="tt-blob" style={{ top: -60, right: -60, width: 400, height: 400, background: "var(--c-accent)", opacity: 0.35 }} />
      <div className="tt-blob" style={{ bottom: -80, left: -60, width: 350, height: 350, background: "var(--c-primaryFg)", opacity: 0.06 }} />

      <div style={{ position: "relative" }}>
        <div className="tt-eyebrow" style={{ color: "color-mix(in oklch, var(--c-primaryFg), transparent 30%)" }}>Nigerian retail, unlocked</div>
        <div className="tt-head" style={{ fontSize: 44, marginTop: 12, maxWidth: 460, letterSpacing: "var(--letter-tight)" }}>Your entire shop. In every pocket. Even offline.</div>
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 36 }}>
          {p.stat.map((s) => (
            <div key={s.l}>
              <div className="tt-head" style={{ fontSize: 26, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ paddingLeft: 20, borderLeft: "2px solid color-mix(in oklch, var(--c-primaryFg), transparent 70%)" }}>
          <div style={{ fontSize: 17, lineHeight: 1.5, marginBottom: 12, fontFamily: "var(--font-head)", fontWeight: 400 }}>"{p.quote}"</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{p.who} · {p.role}</div>
        </div>
      </div>
    </div>
  );
}

function Login(props) {
  return (
    <AuthShell {...props} activeAuth="login">
      <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Sign in</div>
      <h1 className="tt-head" style={{ fontSize: 36, margin: "0 0 8px" }}>Welcome back.</h1>
      <p className="tt-muted" style={{ fontSize: 14, margin: "0 0 32px" }}>Access your shop dashboard, POS, and inventory.</p>

      <div className="tt-flex-col" style={{ gap: 14 }}>
        <div>
          <label className="tt-label">Email</label>
          <div style={{ position: "relative" }}>
            <IconMail size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="you@shop.com" defaultValue="amaka@onyekastores.ng" />
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label className="tt-label">Password</label>
            <a onClick={() => props.onNavigate("auth-forgot")} style={{ fontSize: 12, color: "var(--c-primary)", cursor: "pointer" }}>Forgot?</a>
          </div>
          <div style={{ position: "relative" }}>
            <IconLock size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input className="tt-input" type="password" style={{ paddingLeft: 34, paddingRight: 40 }} defaultValue="••••••••••••" />
            <IconEye size={14} className="tt-muted" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }} />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--c-textMuted)", cursor: "pointer" }}>
          <input type="checkbox" style={{ width: 16, height: 16 }} defaultChecked />
          Keep me signed in on this device
        </label>
        <button className="tt-btn tt-btn-primary tt-btn-lg" onClick={() => props.onNavigate("dashboard")}>Sign in</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
          <div className="tt-muted" style={{ fontSize: 11 }}>or</div>
          <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
        </div>
        <button className="tt-btn tt-btn-secondary tt-btn-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
      <div className="tt-muted" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
        New to TradeTrack? <a onClick={() => props.onNavigate("auth-signup")} style={{ color: "var(--c-primary)", cursor: "pointer", fontWeight: 550 }}>Create your merchant account</a>
      </div>
    </AuthShell>
  );
}

function Signup(props) {
  return (
    <AuthShell {...props} activeAuth="signup">
      <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Create your merchant</div>
      <h1 className="tt-head" style={{ fontSize: 34, margin: "0 0 8px" }}>Set up your shop in 10 minutes.</h1>
      <p className="tt-muted" style={{ fontSize: 14, margin: "0 0 24px" }}>You'll get your own dashboard, users, and Zainpay Naira account.</p>

      <div className="tt-flex-col" style={{ gap: 12 }}>
        <div className="tt-grid tt-grid-2" style={{ gap: 12 }}>
          <div>
            <label className="tt-label">Business name</label>
            <input className="tt-input" placeholder="Onyeka Provision Stores" />
          </div>
          <div>
            <label className="tt-label">Owner name</label>
            <input className="tt-input" placeholder="Amaka Onyeka" />
          </div>
        </div>
        <div>
          <label className="tt-label">Business email</label>
          <input className="tt-input" placeholder="you@shop.com" />
        </div>
        <div className="tt-grid tt-grid-2" style={{ gap: 12 }}>
          <div>
            <label className="tt-label">Phone</label>
            <input className="tt-input" placeholder="+234 803 123 4567" />
          </div>
          <div>
            <label className="tt-label">State</label>
            <select className="tt-input">
              <option>Lagos</option><option>Abia</option><option>Kano</option><option>Anambra</option>
            </select>
          </div>
        </div>
        <div>
          <label className="tt-label">Password</label>
          <input className="tt-input" type="password" placeholder="8+ characters" />
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {[1,2,3,4].map((i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= 3 ? "var(--c-success)" : "var(--c-border)" }} />
            ))}
          </div>
          <div className="tt-muted" style={{ fontSize: 11, marginTop: 6 }}>Strong · Includes upper, lower, number, and length</div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--c-textMuted)" }}>
          <input type="checkbox" style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} defaultChecked />
          <span>I agree to the <a style={{ color: "var(--c-primary)", cursor: "pointer" }}>Terms of Service</a> and <a style={{ color: "var(--c-primary)", cursor: "pointer" }}>Privacy Policy</a>, and consent to a Zainpay Naira account being created for my business.</span>
        </label>
        <button className="tt-btn tt-btn-primary tt-btn-lg" onClick={() => props.onNavigate("auth-change")}>Create merchant account</button>
      </div>

      <div className="tt-muted" style={{ fontSize: 13, textAlign: "center", marginTop: 20 }}>
        Already have an account? <a onClick={() => props.onNavigate("auth-login")} style={{ color: "var(--c-primary)", cursor: "pointer", fontWeight: 550 }}>Sign in</a>
      </div>
    </AuthShell>
  );
}

function Forgot(props) {
  return (
    <AuthShell {...props} activeAuth="forgot">
      <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Reset password</div>
      <h1 className="tt-head" style={{ fontSize: 34, margin: "0 0 8px" }}>Let's get you back in.</h1>
      <p className="tt-muted" style={{ fontSize: 14, margin: "0 0 32px" }}>Enter the email tied to your merchant account. We'll send a reset link.</p>

      <div className="tt-flex-col" style={{ gap: 14 }}>
        <div>
          <label className="tt-label">Email</label>
          <div style={{ position: "relative" }}>
            <IconMail size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="you@shop.com" />
          </div>
        </div>
        <button className="tt-btn tt-btn-primary tt-btn-lg">Send reset link</button>
        <button className="tt-btn tt-btn-ghost" onClick={() => props.onNavigate("auth-login")}>
          <IconArrowLeft size={14} /> Back to sign in
        </button>
      </div>

      <div className="tt-card-flat" style={{ padding: 16, marginTop: 24, display: "flex", gap: 12 }}>
        <IconInfo size={16} className="tt-muted" style={{ marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Cashier or admin account?</div>
          <div className="tt-muted" style={{ fontSize: 12, marginTop: 4 }}>Ask your business owner to reset your password from Settings → Team. We only send resets directly to business owners.</div>
        </div>
      </div>
    </AuthShell>
  );
}

function ChangePassword(props) {
  return (
    <AuthShell {...props} activeAuth="change">
      <div className="tt-badge tt-badge-warn" style={{ marginBottom: 16 }}>
        <IconAlert size={12} /> Required · First-time login
      </div>
      <h1 className="tt-head" style={{ fontSize: 32, margin: "0 0 8px" }}>One quick step: choose a new password.</h1>
      <p className="tt-muted" style={{ fontSize: 14, margin: "0 0 32px" }}>Because this account was created for you, please pick a password only you know before you continue.</p>

      <div className="tt-flex-col" style={{ gap: 14 }}>
        <div>
          <label className="tt-label">New password</label>
          <input className="tt-input" type="password" placeholder="Choose a strong password" />
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {[1,2,3,4].map((i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= 4 ? "var(--c-success)" : "var(--c-border)" }} />
            ))}
          </div>
        </div>
        <div>
          <label className="tt-label">Confirm new password</label>
          <input className="tt-input" type="password" placeholder="Type it again" />
        </div>

        <div className="tt-card-flat" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
          {[
            { ok: true, t: "At least 8 characters" },
            { ok: true, t: "Includes upper & lowercase" },
            { ok: true, t: "Includes a number" },
            { ok: false, t: "Includes a symbol (recommended)" },
          ].map((r) => (
            <div key={r.t} style={{ display: "flex", gap: 8 }}>
              <IconCheck size={12} style={{ color: r.ok ? "var(--c-success)" : "var(--c-textFaint)", marginTop: 3 }} />
              <span style={{ color: r.ok ? "var(--c-text)" : "var(--c-textMuted)" }}>{r.t}</span>
            </div>
          ))}
        </div>
        <button className="tt-btn tt-btn-primary tt-btn-lg" onClick={() => props.onNavigate("dashboard")}>Save & continue to dashboard</button>
      </div>
    </AuthShell>
  );
}

Object.assign(window, { Login, Signup, Forgot, ChangePassword });
