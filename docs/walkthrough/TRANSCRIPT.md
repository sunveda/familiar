# Familiar walkthrough transcript

Created 2026-11-04. Stock synthetic narration; all data is synthetic. Actual captures show a local prototype; native views and planned screens are illustrations.

## 00:00 — Familiar

**LOCAL PROTOTYPE · NOVEMBER 2026**

Familiar aims to personalize educational videos with a registered, consenting parent’s face and voice. This walkthrough separates the current local prototype from planned features. All examples are synthetic. The narrator is a stock computer voice, not a parent or child.

## 00:17 — What the product must do

**PRODUCT SPECIFICATION**

The specification calls for web, iOS, and Android clients sharing a family-scoped API. A parent must consent before enrollment and conversion. Revocation must stop downstream use. A guardian must review output before a child can see it. Real authentication and conversion are not implemented.

## 00:37 — 01 / Home

**ACTUAL LOCAL WEB CAPTURE**

This is the actual web Home screen. The permanent banner explains that identity is only a development header claim, not a secure login. The navigation contains Home, Review, and Dev settings. English and Japanese are available. There is no capture or media playback.

## 00:55 — 02 / Dev settings

**ACTUAL LOCAL WEB CAPTURE**

Dev settings accepts the API base URL, family ID, and guardian ID. These example values are synthetic, not credentials. Save stores the development settings locally, and Check API health checks connectivity. The local walkthrough server is read only and refuses all write requests.

## 01:14 — 03 / Review list

**ACTUAL LOCAL WEB CAPTURE**

Review loads the synthetic family job list from the local API. Each row shows a job identifier and status. Select a row to fetch its details, or use Refresh to reload. Empty and error states are implemented. Foreign-family or malformed data is refused.

## 01:31 — 04 / Job details

**ACTUAL LOCAL WEB CAPTURE**

The detail screen shows the selected job, its status, target enrollment, and update time. Back to jobs returns to the list. Preview is explicitly unavailable. There is no approve or release button. A needs-review status does not mean any playable or converted video exists.

## 01:50 — 05 / Native entry

**ILLUSTRATION · NOT A DEVICE CAPTURE**

These are illustrations based on the current SwiftUI and Compose source, not verified device captures. Both clients start with synthetic fixture data. They show a guardian job list, details, and an unavailable-preview message. iOS is still a reusable package without a complete app host.

## 02:09 — 06 / Native connection

**ILLUSTRATION · UNVERIFIED NETWORK FLOW**

The native development forms request an HTTPS endpoint and synthetic family and guardian IDs. Cancel returns to fixture mode. Connect is intended to load read-only metadata. Settings stay in memory. A trusted HTTPS endpoint and device testing are still needed; this flow is not verified end to end.

## 02:29 — 07 / Native review

**ILLUSTRATION · UNVERIFIED DEVICE FLOW**

Connected native views are designed to fetch the list and fresh details, show loading and errors, and discard late results after leaving a screen. Disconnect returns to fixtures. Neither adapter exposes approval, release, or media playback. Android builds and native navigation tests remain unverified.

## 02:49 — Planned / consent & enrollment

**PLANNED · ILLUSTRATIVE WIREFRAMES**

The planned flow begins with secure guardian sign-in, explicit consent, and parent enrollment. Consent choices must start unchecked. Voice and face capture must wait for valid consent and the required privacy review. The boxes here are illustrative wireframes. These screens and capture capabilities are not implemented.

## 03:09 — Planned / conversion to playback

**PLANNED · ILLUSTRATIVE WIREFRAMES**

Next, a guardian would provide a source, choose a registered in-family parent, and request conversion. The backend would recheck consent, then create a preview for guardian approval or rejection. Only approved output could reach a child. Real conversion, preview, approval delivery, and child playback remain unfinished.

## 03:30 — What works / what comes next

**STATUS & VALIDATION LIMITS**

Today, the local web review demo works with synthetic metadata. Two hundred and five JavaScript and TypeScript tests pass. Swift API smoke checks pass, but SwiftUI tooling blocks a full build. Android tooling is absent. No native end-to-end verification, production login, real enrollment, conversion, or media release is claimed.
