import posthog from 'posthog-js'

// --- Signup / Login funnel ---

export function trackSignupPageViewed(props: { mode: string; has_referral: boolean }) {
  posthog.capture('signup_page_viewed', props)
}

export function trackAuthTabSwitched(props: { tab: 'signup' | 'login' }) {
  posthog.capture('auth_tab_switched', props)
}

export function trackSignupSubmitted(props: { method: 'email' | 'google' }) {
  posthog.capture('signup_submitted', props)
}

export function trackSignupError(props: { error: string }) {
  posthog.capture('signup_error', props)
}

export function trackLoginSubmitted(props: { method: 'email' | 'google' }) {
  posthog.capture('login_submitted', props)
}

export function trackLoginError(props: { error: string }) {
  posthog.capture('login_error', props)
}

export function trackEmailVerificationSent() {
  posthog.capture('email_verification_sent')
}

export function trackAuthCallbackReached(props: { needs_username: boolean }) {
  posthog.capture('auth_callback_reached', props)
}

export function trackUsernameChosen() {
  posthog.capture('username_chosen')
}

export function trackWelcomePageLoaded() {
  posthog.capture('welcome_page_loaded')
}

export function trackCreditsGranted() {
  posthog.capture('credits_granted')
}

export function trackReferralApplied(props: { success: boolean }) {
  posthog.capture('referral_applied', props)
}

export function trackOnboardingComplete() {
  posthog.capture('onboarding_complete')
}

// --- Engagement ---

export function trackGameCompleted(props: { game_type: string; score?: number; valid?: boolean; rank?: number }) {
  posthog.capture('game_completed', props)
}

export function trackGroupPlayCreated(props: { game_type: string }) {
  posthog.capture('group_play_created', props)
}

export function trackGroupPlayJoined(props: { game_type: string; player_count: number }) {
  posthog.capture('group_play_joined', props)
}

export function trackCreditsClaimed(props: { claim_type: 'winnings' | 'daily'; amount: number; new_balance: number }) {
  posthog.capture('credits_claimed', props)
}

export function trackReferralShared(props: { method: 'native_share' | 'clipboard'; location: string }) {
  posthog.capture('referral_shared', props)
}

export function trackLeaderboardTabSwitched(props: { game_type: string; period: string }) {
  posthog.capture('leaderboard_tab_switched', props)
}

// --- Identity ---

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  posthog.identify(userId, traits)
}

export function resetUser() {
  posthog.reset()
}
