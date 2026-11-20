---
name: Clinical Intelligence Command
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3f4850'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#006399'
  on-secondary: '#ffffff'
  secondary-container: '#7bc2ff'
  on-secondary-container: '#004f7b'
  tertiary: '#545c72'
  on-tertiary: '#ffffff'
  tertiary-container: '#6c748b'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#94ccff'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#004b74'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system targets executive medical directors, clinical data scientists, and healthcare operations leads managing enterprise-scale dental and health networks. The visual philosophy blends high-density enterprise SaaS utility with clinical precision and reassurance.

Key attributes:
- **Clinical Rigor & Surgical Clarity**: High data density without visual clutter, crisp structural hierarchy, and surgical alignment.
- **Cognitive Safety**: Color is strictly functional; clinical risk alerts must be unmistakable and immediate.
- **Modern Corporate Meets High-End Tech**: Subdued surface planes paired with sharp technical typography, low-contrast structural borders, and subtle elevation layers.

## Colors

The palette balances sterile clarity with unmistakable clinical signaling:

- **Primary & Actions**: `#0284c7` (Sky 600) drives key interactive triggers, primary focus states, and analytical chart series. `#0369a1` (Sky 700) provides stable contrast for active/hover states and primary buttons.
- **Surfaces & Layout Tiers**:
  - Pure Base: `#ffffff`
  - Canvas / Shell Background: `#f8fafc` (Slate 50)
  - Card & Container Surface: `#ffffff`
  - Structural Division / Borders: `#e2e8f0` (Slate 200)
  - Subtle Table Zebra / Hover Striping: `#f1f5f9` (Slate 100)
- **Clinical Triage & Risk Semantic Palette**:
  - **High Risk / Critical**: Solid `#ef4444` (Red 500) | Surface Tint `#fef2f2` | Border `#fecaca`
  - **Moderate Risk / Warning**: Solid `#f59e0b` (Amber 500) | Surface Tint `#fffbeb` | Border `#fde68a`
  - **Low Risk / Optimal**: Solid `#10b981` (Emerald 500) | Surface Tint `#ecfdf5` | Border `#a7f3d0`
- **Data & Text**:
  - Primary Typography: `#0f172a` (Slate 900)
  - Secondary / Supporting: `#475569` (Slate 600)
  - Subtle / Metadata: `#94a3b8` (Slate 400)

## Typography

- **Executive Titles (`Plus Jakarta Sans`)**: Applied strictly to operational KPIs, section dashboards, and modal headings. Conveys modern precision without sterile harshness.
- **Clinical Reading & UI Controls (`Inter`)**: Chosen for high micro-legibility in tabular layouts, dense form fields, and status summaries. Numerical tables must leverage tabular figures (`tnum`).
- **Telemetry & Technical Specs (`JetBrains Mono`)**: Utilized for patient record IDs, ETL pipeline timestamps, SQL queries, database ingestion counts, and raw Power BI endpoint strings.

## Layout & Spacing

The layout is structured around an adaptive 12-column responsive fluid grid designed for dual operation: full-screen command center monitors (1080p to 4K) and mobile telemetry viewing.

- **Breakpoints**:
  - `Mobile` (< 768px): Single-column stacks, sticky telemetry filters, horizontal overflow scrolling for clinical tables.
  - `Tablet` (768px - 1199px): 8-column layout, two-up metric cards, collapsable auxiliary panels.
  - `Desktop` (≥ 1200px): 12-column layout with a fixed 260px administrative navigation spine and 16:9 responsive media framing for BI dashboards.
- **Rhythm**: Density is compact to allow clinical monitors to display high volumes of active patient and financial intelligence above the fold without scrolling.

## Elevation & Depth

Visual hierarchy uses crisp, low-contrast structural boundaries with faint, clinical ambient shadows.

- **Surface Levels**:
  - `Canvas (Level 0)`: Slate 50 (`#f8fafc`), flat base.
  - `Panel / Card (Level 1)`: Pure White (`#ffffff`) surrounded by a 1px solid border (`#e2e8f0`). Ambient shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
  - `Interactive Hover / Popover (Level 2)`: Raised card state. Ambient shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
  - `Clinical Modal / Overlay (Level 3)`: Centered executive dialogs and full SQL parameter modals. Shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`.
- Avoid heavy drop shadows or dramatic neon glows; maintain clinical sterility and clarity.

## Shapes

The geometric framework is calibrated to `1` (Soft):
- Standard controls, badges, inputs, and table cells utilize `0.25rem` (4px) or `0.375rem` (6px) corner radiuses.
- KPI cards, analytical charts, and embedded Power BI viewports employ `rounded-lg` (8px).
- Modals, large panels, and drawer shells scale to `rounded-xl` (12px).
- Pill formats (`rounded-full`) are strictly reserved for clinical triage status badges and live status indicator dots.

## Components

### 1. Clinical Risk Badges
- **Structure**: Inline pill container (`rounded-full`), `space-xs` vertical padding, `space-sm` horizontal padding.
- **Indicators**:
  - *High Risk*: Red 500 dot (6px) + text `#991b1b` on `#fef2f2` background with `#fecaca` border.
  - *Medium Risk*: Amber 500 dot (6px) + text `#92400e` on `#fffbeb` background with `#fde68a` border.
  - *Low Risk*: Emerald 500 dot (6px) + text `#065f46` on `#ecfdf5` background with `#a7f3d0` border.
- **Typography**: Label Small (`label-sm`), uppercase, tracking tight.

### 2. Analytical KPI Metric Cards
- **Structure**: Surface Level 1 card, 1px border `#e2e8f0`, internal padding `space-lg`.
- **Elements**: 
  - Top row: Category tag (`label-sm`, `#64748b`) paired with live status dot.
  - Center: Numerical metric (`display-lg`, `Plus Jakarta Sans`, tabular figures).
  - Bottom: Micro trend badge with arrow icon (Green `#10b981` or Red `#ef4444`) followed by comparison baseline ("vs. past 30 days").

### 3. High-Density SaaS Clinical Tables
- **Header**: `#f8fafc` background, `#475569` text, `11px` bold uppercase font, bottom border `1px solid #cbd5e1`.
- **Rows**: Alternating subtle zebra striping (`#ffffff` to `#fcfdfe`), 40px cell height for high scanning speed.
- **Row Hover**: Subtle tint of `#f0f9ff` (Sky 50) with an active primary left border indicator (`2px solid #0284c7`).
- **Identifiers**: Patient keys, episode numbers, and clinical codes rendered in `JetBrains Mono` (`code-sm`).

### 4. Executive Tabs & Segmented Filters
- Horizontal line style with a base `#e2e8f0` border.
- Active tab features bold `#0369a1` text with an anchored `2px` underline indicator in `#0284c7`.
- Metric counter pills positioned next to tab labels display item totals in neutral slate backgrounds.

### 5. Power BI Embed & 16:9 Viewport Controller
- **URL Input Group**: Monospace URL field with integrated action icon, SSL validation check, and an instant "Sync Embed" primary action button.
- **Viewport Frame**: Aspect ratio fixed at 16:9, wrapped with a 1px border `#e2e8f0`, smooth 8px border radius, and an automated loading skeleton overlay styled with a subtle pulse animation on `#f1f5f9`.

### 6. SQL Server ETL Pipeline Telemetry Monitor
- **Terminal Shell**: Dark slate canvas (`#0f172a`) inset inside administrative panes.
- **Pipeline Nodes**: Visual graph depicting Extract (SQL Server), Transform (IA Model), and Load (Power BI Cache).
- **Log Stream**: Real-time status logs in `JetBrains Mono` with timestamp in `#64748b`, operation status in `#38bdf8`, and error rows highlighted in `#ef4444`.