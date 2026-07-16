# Example: Flutter Auth Prompts (Phase 3)

> Flutter-specific Phase 3 prompts. Auth uses Firebase Auth with Riverpod `AsyncNotifier` for state management and GoRouter for redirect handling. Context: Finora Flutter, Phases 1–2 complete — `users` Firestore collection defined in [8].
>
> **Package versions:**
>
> ```
> firebase_auth: ^4.20.0
> flutter_riverpod: ^2.5.0
> riverpod_annotation: ^2.3.5
> go_router: ^14.2.0
> google_sign_in: ^6.2.1
> ```
>
> Verify at [pub.dev](https://pub.dev) before use.

---

## [ ] [18] We're building the AuthNotifier for Finora Flutter — the Riverpod AsyncNotifier that manages Firebase Auth state, syncs the Finora user profile from Firestore, and exposes sign-in, register, and sign-out methods.

**What the AuthNotifier owns —** All auth state in Finora Flutter flows through this notifier. It holds the signed-in `User?` (the Finora `User` model from [8], not the Firebase `User` object). It exposes: `signIn(email, password)`, `register(email, password, displayName)`, `signOut()`, `signInWithGoogle()`. Widgets access auth state via `ref.watch(authNotifierProvider)` — they never import `firebase_auth` directly.

**`build()` method —** The `build()` method establishes a permanent listener to `FirebaseAuth.instance.authStateChanges()`. For each emission: if `null` → set state to `null`. If a `FirebaseUser` is received → fetch the `users/{uid}` document from Firestore to get the full `User` model. If the Firestore document does not yet exist (the Cloud Function from [8] may still be creating it), retry every 500ms up to 5 times before returning an error state. The listener subscription is cancelled when the notifier is disposed.

**`register()` method —** Calls `FirebaseAuth.instance.createUserWithEmailAndPassword()`. On success, calls `firebaseUser.sendEmailVerification()`. Does NOT manually set state — the `authStateChanges` listener handles the state transition. Catches `FirebaseAuthException` and maps error codes to `AuthError` domain errors before rethrowing.

**`signIn()` method —** Calls `FirebaseAuth.instance.signInWithEmailAndPassword()`. On success, state is set by the `authStateChanges` listener. Maps Firebase error codes to `AuthError` on failure.

**`signInWithGoogle()` method —** Uses `GoogleSignIn().signIn()` to get a `GoogleSignInAccount`. If the user cancels the flow (`GoogleSignInAccount` is null), return without setting an error. Converts to a Firebase credential and calls `FirebaseAuth.instance.signInWithCredential()`. Maps errors to `AuthError`.

**`signOut()` method —** Calls `FirebaseAuth.instance.signOut()` and also calls `GoogleSignIn().signOut()` (necessary to force the Google account picker to appear on the next Google sign-in).

**AuthError hierarchy —** A sealed class `AuthError` with subtypes: `EmailAlreadyInUse`, `WeakPassword`, `WrongPassword`, `UserNotFound`, `TooManyRequests`, `NetworkError`, `UserDisabled`, `UnknownAuthError(code: String)`. Map from `FirebaseAuthException.code`.

## Instructions

**Files to create:**

- `lib/features/auth/models/auth_error.dart` — sealed class hierarchy
- `lib/features/auth/providers/auth_notifier.dart` — the `@riverpod` AsyncNotifier
- `lib/features/auth/providers/auth_providers.dart` — re-exports the generated provider

**`AuthNotifier` class declaration —**
Annotate with `@riverpod`. Extend `AsyncNotifier<User?>`. The `build()` method returns a `Future<User?>` that completes with the initial auth state. Internally, it calls `ref.onDispose` to cancel the `authStateChanges` subscription.

**Firestore user fetch with retry —**
Inside the `authStateChanges` callback, after receiving a non-null `FirebaseUser`:

1. Call `ref.read(userRepositoryProvider).getUser(uid)`.
2. If null (document not yet created): wait 500ms and retry. Retry limit: 5 attempts.
3. If still null after 5 attempts: set state to `AsyncError` with a descriptive message.
4. If found: set state to `AsyncData(finoraUser)`.

**`AuthError` mapping —**
Define a static method `AuthError.fromFirebaseCode(String code)` that maps:

- `'email-already-in-use'` → `EmailAlreadyInUse()`
- `'wrong-password'` or `'invalid-credential'` → `WrongPassword()`
- `'user-not-found'` → `UserNotFound()`
- `'too-many-requests'` → `TooManyRequests()`
- `'network-request-failed'` → `NetworkError()`
- `'user-disabled'` → `UserDisabled()`
- all others → `UnknownAuthError(code: code)`

**Code generation —** After creating the notifier, run `dart run build_runner build`. The generated provider is `authNotifierProvider`.

## Verification

I'll verify this implementation automatically. I can:

- Sign in with valid credentials → `ref.read(authNotifierProvider)` → expect `AsyncData<User?>` with a non-null Finora `User` (not a `FirebaseUser`).
- Sign in with wrong password → expect `WrongPassword` error surfaced via `AsyncError`.
- Sign out → `ref.read(authNotifierProvider)` → expect `AsyncData(null)`.
- Register a new user → Firestore document created by Cloud Function → wait 500ms → expect `authStateChanges` to populate state with the new user profile.
- Cancel the Google sign-in picker → expect no state change and no error.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Run the app → sign in with email/password → verify the dashboard loads with the correct `user.displayName`.
- Force-quit the app → reopen → verify the user is still signed in (Firebase Auth session persists across app restarts by default).

Then give me your honest assessment of:

- Whether the 5-retry + 500ms delay (2.5 seconds total maximum wait) for the Firestore user document will cause a noticeable "stuck" feeling on first registration — and whether a loading screen with explicit "Setting up your account..." copy is needed to prevent users from thinking the app has crashed.

---

## [ ] [19] We're building the GoRouter configuration for Finora Flutter — defining all routes, enforcing auth guards via redirect, handling the loading state with a splash screen, and supporting deep links.

**All routes —** GoRouter must declare a route for every screen in Finora: `/login`, `/register`, `/forgot-password`, `/verify-email`, `/onboarding`, `/dashboard`, `/transactions` (list), `/transactions/:id` (detail), `/transactions/new` (create), `/categories`, `/reports`, `/settings`, `/settings/profile`, `/settings/notifications`.

**Auth guard via redirect —** GoRouter's `redirect` callback is called before every navigation. It reads `authNotifierProvider`. Three cases: (a) auth is still loading (`AsyncLoading`) → redirect to `/splash`; (b) auth is null (signed out) and destination is not an auth route → redirect to `/login?from={encodedPath}`; (c) auth is not null (signed in) and destination is an auth route (`/login`, `/register`) → redirect to `/dashboard`.

**Splash screen —** `/splash` is a simple screen with the Finora logo centered. It has no navigation actions — users can never navigate there manually. GoRouter redirects away from it as soon as auth state resolves (either to the protected destination or to `/login`).

**Deep links —** Configure the app to handle the `finora://` custom scheme deep links. On Android: declare an `intent-filter` in `AndroidManifest.xml` for the scheme `finora` and host `open`. On iOS: add a `CFBundleURLScheme` entry in `Info.plist`. GoRouter's `routerDelegate` handles the deep link by matching the path against the declared routes.

**`from` query param for auth redirect —** When a signed-out user is redirected to `/login`, the original destination is passed as the `from` query param (URL-encoded). After sign-in, the login screen reads this param from `GoRouterState.uri.queryParameters['from']` and calls `context.go(from)`. The `from` value must start with `/` before use (open redirect prevention).

## Instructions

**File:** `lib/app/router.dart`

**GoRouter construction —**
Instantiate `GoRouter` inside a `@riverpod` function (so it can `ref.watch(authNotifierProvider)`). Set `refreshListenable` to a `GoRouterRefreshStream` that wraps the `authNotifierProvider`'s stream — this triggers a redirect check on every auth state change.

**Route declarations —**

- `/splash`: `SplashScreen` widget
- `/login`, `/register`, `/forgot-password`, `/verify-email`: auth routes (no guard)
- `/onboarding`: accessible only if `user != null && !user.onboardingCompleted`; redirect to `/dashboard` if already completed
- All `/dashboard`, `/transactions/*`, etc.: protected routes

**Auth route groups —**
Use GoRouter's `ShellRoute` to wrap all protected routes with the `AppScaffold` (which contains the bottom navigation bar). The shell only renders for signed-in users.

**Redirect logic —**
Implement the redirect callback using a series of `if/else if` conditions in the exact order: (1) loading state check, (2) unauthenticated + protected route check, (3) authenticated + auth route check. Return `null` (no redirect) for all other cases.

**Deep link configuration (Android) —**
In `android/app/src/main/AndroidManifest.xml`, add an `intent-filter` inside the `MainActivity` element with `action.VIEW`, `category.DEFAULT`, `category.BROWSABLE`, `data` element with `android:scheme="finora"` and `android:host="open"`.

**Deep link configuration (iOS) —**
In `ios/Runner/Info.plist`, add a `CFBundleURLTypes` array entry with `CFBundleURLScheme` value `finora`.

**`lib/app/app.dart` —**
The root widget is a `ProviderScope` containing a `MaterialApp.router` that receives `routerConfig: ref.watch(routerProvider)`. Set `theme` to the Finora Material 3 theme (defined separately in `lib/app/theme.dart`). Set `debugShowCheckedModeBanner: false`.

## Verification

I'll verify this implementation automatically. I can:

- Launch the app while signed out → navigate to `/dashboard` deep link → expect redirect to `/login?from=%2Fdashboard`.
- Sign in from that state → expect GoRouter to navigate to `/dashboard` (the `from` param is honored).
- Launch the app while signed in → navigate to `/login` → expect redirect to `/dashboard`.
- Launch the app before auth state resolves → expect `/splash` to render briefly, then redirect automatically.
- Open `finora://open/transactions/some-id` deep link (via `adb shell am start`) → expect the Transaction Detail screen to open.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Sign out → tap on a notification (if implemented) that deep-links to `/transactions/some-id` → expect the Login screen with the correct `from` param → sign in → expect navigation to `/transactions/some-id`.
- Use Android back button on the Transaction Detail screen → expect navigation to the Transaction List, not app exit.

Then give me your honest assessment of:

- Whether wrapping GoRouter in a Riverpod provider (rather than creating it as a global singleton) introduces any lifecycle issues — specifically, whether the router gets recreated on provider rebuild which would cause the navigation stack to reset unexpectedly.
