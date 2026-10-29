# Flo Sisterlocks — Master Design System (`ui-ux-pro-max` + Mobbin + 21st.dev)

## 1. Brand & Product Archetype
- **Product Category:** Beauty / Spa / Luxury Salon Booking & CRM (`Beauty/Spa/Wellness Service`)
- **Design Paradigm:** Soft UI Evolution + Subtle Warm Glassmorphism (`#FAF8F5` Warm Ivory Canvas, `#C4466F` Saturated Rose Pink CTA, `#231F1D` Deep Espresso Ink)
- **Flow Benchmarks (Mobbin & 21st.dev):**
  - **Interactive Stepper:** Clickable completed steps with checkmarks, active step pill highlight, and smooth progress bar fill.
  - **Service Discovery (`Coach Scheduling Card` / Fresha pattern):** Editorial header, category filter pills, rich service cards showing description + exact `1h 30m` duration badge + price + tactile selection indicator.
  - **Unified Floating Checkout Dock:** Persistent dark espresso glass summary bar (`rgba(44, 34, 30, 0.88)`) across Service Selection, Date/Time Selection, and Client Details.
  - **Booking Review & Client Details (`Appointment Booking Split`):** Ticket-style appointment summary card with quick "Edit" links for Service and Date/Time, paired with icon-prefixed glass form inputs and WhatsApp confirmation assurance.
  - **Salon Pass & Lookup (`Ticket Confirmation Card`):** Cohesive glassmorphic pass card, toast feedback instead of raw browser alerts, and matching reschedule/cancel controls.

## 2. Color Tokens (WCAG AA/AAA Verified)
| Token | Value | Role & Contrast |
| :--- | :--- | :--- |
| `--color-bg-salon` | `#FAF8F5` | Warm Ivory primary canvas |
| `--color-surface-glass` | `rgba(255, 255, 255, 0.78)` | Frosted card surface (`backdrop-filter: blur(12px)`) |
| `--color-surface-espresso` | `rgba(44, 34, 30, 0.90)` | Floating bottom checkout dock & selected calendar pills |
| `--color-primary` | `#C4466F` | Primary Rose Pink CTA (`4.8:1` on white) |
| `--color-primary-hover` | `#A83257` | Hover/Active state for primary CTA |
| `--color-text-dark` | `#231F1D` | Primary Espresso heading & body ink (`16.2:1`) |
| `--color-text-sub` | `#6E655F` | Secondary metadata & labels (`5.1:1`) |
| `--color-border-glass` | `rgba(240, 213, 222, 0.75)` | Subtle rose-tinted card border |

## 3. Typography Scale
- **Display / Headings (`--font-serif`):** `"Playfair Display", serif` — Weight `700–900`, tight tracking (`-0.02em`).
- **UI / Body / Controls (`--font-sans`):** `"Plus Jakarta Sans", "Inter", sans-serif` — Weight `400–700`.
- **Reference Codes & Time Badges:** Monospace / tabular numerals for scannability.

## 4. Interaction & Accessibility Rules (`ui-ux-pro-max`)
- **Touch Targets:** Minimum `44x44px` (`min-h-[44px]`) on all interactive buttons, chips, stepper nodes, and calendar cells.
- **No Raw Browser Alerts:** Use the in-app `triggerToast` notification banner instead of `window.alert()`.
- **Duration Formatting:** Always format durations human-readably (`1h 30m` rather than `90 min` or rounded hours).
- **Form Ergonomics:** Provide appropriate `inputMode`, `autoComplete`, clear focus rings (`focus:border-[#C4466F] focus:ring-2 focus:ring-[#C4466F]/15`), and inline WhatsApp notification assurance on the phone field.
