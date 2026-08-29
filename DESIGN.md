---
name: "The Swell Parts"
description: "A sunlit working set list for songs, assignments, setups, and gear."
colors:
  soundcheck-teal: "#1B6B7A"
  soundcheck-teal-hover: "#005B6A"
  sand-background: "#FEF9ED"
  paper-surface: "#FFFCF6"
  espresso-ink: "#2C2A28"
  driftwood-text: "#726357"
  dune-secondary: "#F3E9D6"
  dune-secondary-hover: "#E9DECA"
  dune-muted: "#F5EEE0"
  driftwood-border: "#E3D8C7"
  beach-glass-accent: "#8FD0E0"
  coral-alert: "#FF7350"
  cable-gold: "#F4B43D"
  confirmation-green: "#20D20A"
  part-coral: "#FC440F"
  part-sun: "#FFD900"
  part-lime: "#9BC53D"
  part-sky: "#5BC0EB"
  part-purple: "#592E83"
typography:
  display:
    fontFamily: "Londrina Solid, Geist, sans-serif"
    fontSize: "72px"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "-0.025em"
  display-outline:
    fontFamily: "Londrina Shadow, Geist, sans-serif"
    fontSize: "72px"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "0.08em"
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "5px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  2xl: "14.4px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.soundcheck-teal}"
    textColor: "{colors.paper-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
  button-primary-hover:
    backgroundColor: "{colors.soundcheck-teal-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.espresso-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.espresso-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  panel:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge-secondary:
    backgroundColor: "{colors.dune-secondary}"
    textColor: "{colors.espresso-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.2xl}"
    padding: "2px 8px"
    height: "20px"
  nav-active:
    backgroundColor: "{colors.espresso-ink}"
    textColor: "{colors.sand-background}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: The Swell Parts

## Overview

**Creative North Star: "The Working Set List"**

The Swell Parts feels like a dependable set list laid open on a bright rehearsal table near the water. The working surface is a solid sandy neutral, never a photographic texture. Pale ocean color in the header, muted teal actions, the striped Swell logo, and occasional coral or gold cues carry the beach character without turning the product into a themed novelty.

This is a compact internal tool used under time pressure. Familiar controls, predictable grids, clear labels, and strong selected states take priority over ornament. Members should reach the effective answer quickly; administrators can handle denser planning views, but the interface must remain warm and legible.

The system explicitly rejects a generic SaaS analytics dashboard, a decorative music-festival aesthetic, and a dense enterprise staffing system. It also rejects the old photographic sand background, which made a modern working tool feel like an early personal website.

**Key Characteristics:**

- Solid sand working surfaces with pale ocean structure
- Dark espresso text and restrained soundcheck teal actions
- Compact, familiar controls with tactile offset shadows
- Londrina display type reserved for song, member, and part identity
- Geist for every working label, control, table, and explanation
- Responsive layouts that stack structurally rather than shrinking typography

## Colors

The palette is a sunlit beach vocabulary translated into a restrained product system: sand and paper carry most surfaces, espresso creates clarity, and teal appears only where interaction or selection needs a strong voice.

### Primary

- **Soundcheck Teal:** Primary actions, selection rings, active diagram connections, and high-value status emphasis.
- **Deep Soundcheck Teal:** Hover state for primary actions. It deepens the same hue instead of introducing a new accent.

### Secondary

- **Dune Secondary:** Quiet controls, inactive tabs, toolbars, and grouped utility surfaces.
- **Beach Glass Accent:** Hover fills, pale ocean emphasis, and supporting information that should feel lighter than a primary action.

### Tertiary

- **Coral Alert:** Destructive actions and explicit error states.
- **Cable Gold:** Lead-vocal emphasis and warm attention cues.
- **Confirmation Green:** Short-lived successful assignment and scan confirmation. It must always appear with a checkmark or text label.
- **Part Spectrum:** Coral, sun, lime, sky, and purple distinguish musical parts and waveforms. These colors identify content; they do not replace labels.

### Neutral

- **Sand Background:** The solid page background and default beach atmosphere.
- **Paper Surface:** Panels, cards, dialogs, popovers, and controls placed above the sand.
- **Espresso Ink:** Primary text, active navigation, and strong control borders.
- **Driftwood Text:** Secondary explanations, metadata, timestamps, and subdued labels.
- **Dune Muted:** Empty states, quiet footer bands, inactive fills, and low-emphasis regions.
- **Driftwood Border:** Dividers, input strokes, card outlines, and the offset shadow vocabulary.

**The Solid Sand Rule.** Page backgrounds are a single sandy color. Never use a beach photograph, faux-paper texture, repeating pattern, or parallax background.

**The One Ocean Rule.** Soundcheck teal is reserved for actions, current selection, focus, and meaningful state. Decorative teal fields are prohibited.

**The Labeled Color Rule.** Coral, gold, green, and the part spectrum always travel with text, iconography, position, or shape. Color alone never carries meaning.

## Typography

**Display Font:** Londrina Solid (with Geist and sans-serif fallbacks)
**Outlined Display Font:** Londrina Shadow (with Geist and sans-serif fallbacks)
**Body Font:** Geist (with sans-serif fallback)
**Label/Mono Font:** Geist Mono (with monospace fallback)

**Character:** Geist keeps the product direct, modern, and highly legible. Londrina contributes the band identity in a narrow set of large, unmistakable titles, giving the beach-era poster character a clear boundary.

### Hierarchy

- **Display** (400, 72px, 0.88): Large song and member titles on spacious detail views. It scales down at smaller breakpoints but never becomes control text.
- **Outlined Display** (400, 72px, 0.88): Part identity only, where the outlined face distinguishes the information type.
- **Headline** (600, 30px, 1.2): Main task headings and page titles in administrative and gear workflows.
- **Title** (600, 18px, 1.4): Section headings, panel titles, and important list-group labels.
- **Body** (400, 16px, 1.5): Instructions and explanatory copy. Prose stays within roughly 65 to 75 characters per line.
- **Label** (600, 12px, 0.08em tracking): Uppercase kickers, compact status context, and short navigational identifiers.
- **Mono** (500, 14px, 1.4): Inventory IDs, band codes, times, measurements, and machine-readable values.

**The Working Type Rule.** Geist is mandatory for controls, navigation, form labels, data, and status text. Display type never enters the working interface.

**The Poster Type Boundary Rule.** Londrina appears only at large scale for a song, member, or part identity. If it fits comfortably inside a button or table cell, it is being used incorrectly.

## Elevation

The system uses a hybrid elevation model. Most separation comes from paper surfaces, solid borders, and muted tonal bands. Tactile controls use compact hard offset shadows; large panels use one barely visible ambient shadow so they settle above the sand without appearing to float.

### Shadow Vocabulary

- **Control XS** (`1px 1px 0 0 var(--border)`): Tiny controls and the lightest pressed affordances.
- **Control SM** (`2px 2px 0 0 var(--border)`): Default tabs, compact buttons, and small floating tools.
- **Control MD** (`4px 4px 0 0 var(--border)`): Primary and outline buttons at rest, plus cards that need tactile separation.
- **Control LG** (`6px 6px 0 0 var(--border)`): Rare, high-emphasis controls only.
- **Panel Ambient** (`0 16px 38px -34px var(--swell-espresso)`): Large paper panels on the solid sand background.

**The Pressed Object Rule.** A tactile control moves down and loses shadow when pressed. It never grows, bounces, or glows decoratively.

**The Flat Content Rule.** Lists and data regions remain flat by default. Borders and spacing establish hierarchy before a shadow is added.

## Components

### Buttons

- **Shape:** Compact, gently squared corners with a strong two-pixel espresso border.
- **Primary:** Soundcheck teal on paper-colored text, medium weight, and a four-pixel offset shadow at rest.
- **Hover / Focus:** Hover deepens the teal and reduces the shadow while the control moves down one pixel. Keyboard focus uses a visible teal outline outside the border.
- **Secondary / Outline:** Dune secondary or transparent fill with the same shape, border, and tactile movement. Ghost buttons remove the border and shadow for low-priority actions.
- **Disabled:** Opacity falls, the pointer affordance disappears, and no hover or pressed movement remains.

### Chips

- **Style:** Fully rounded, compact, and text-led. Secondary chips use dune fill; outline chips use a driftwood stroke.
- **State:** Selected chips may use teal or espresso, but every selected state also changes text contrast or includes a check or pressed state.

### Cards / Containers

- **Corner Style:** Gently curved panels use eight-pixel corners; denser cards may use the smaller five-pixel control radius.
- **Background:** Paper surfaces sit on the solid sand page. Muted bands may divide headers, footers, or grouped controls.
- **Shadow Strategy:** Use the ambient panel shadow for page-level surfaces and the hard offset shadow only for tactile cards or tools.
- **Border:** One-pixel driftwood borders for panels, two pixels for intentionally tactile cards.
- **Internal Padding:** Twelve pixels for dense cards, sixteen to twenty-four pixels for primary task panels.

### Inputs / Fields

- **Style:** Transparent or paper fill, one-pixel driftwood stroke, eight-pixel corners, and compact vertical padding.
- **Focus:** The border becomes soundcheck teal with a three-pixel translucent ring. The field never shifts position.
- **Error / Disabled:** Error uses coral border plus explanatory text. Disabled fields retain structure with muted fill and reduced opacity.

### Navigation

Navigation uses compact bordered tabs with semibold Geist labels. The active tab reverses to espresso ink with sand text. Inactive tabs remain paper-colored and gain a muted fill or teal border on hover. Mobile navigation scrolls horizontally rather than wrapping into an unpredictable grid.

### Page Kickers and Identity Titles

Uppercase page kickers provide quiet wayfinding above task headings. Song and member identity may use Londrina Solid; part identity may use Londrina Shadow. These signature treatments never replace a normal Geist task heading inside forms, dialogs, or administrative workflows.

## Do's and Don'ts

### Do:

- **Do** use the solid Sand Background for every full-page working surface.
- **Do** let the pale ocean header, soundcheck teal actions, striped logo, and warm state accents create the beach atmosphere.
- **Do** keep primary prose within roughly 65 to 75 characters per line and use compact data layouts where scanning benefits from density.
- **Do** preserve 44-pixel touch targets where practical, visible keyboard focus, reduced-motion behavior, and semantic labels.
- **Do** show the effective answer first, then explain whether it came from a default, override, direct check-in, or inherited container.
- **Do** make missing coverage unmistakable with text or icon cues in addition to color.
- **Do** use predictable grids and stack columns structurally on small screens.

### Don't:

- **Don't** use the sand photograph or any background texture. It reads as Web 1.0 and competes with the work.
- **Don't** turn the product into a generic SaaS analytics dashboard.
- **Don't** use a decorative music-festival aesthetic.
- **Don't** build a dense enterprise staffing system.
- **Don't** turn the assignment workflow into a spreadsheet full of repeated records.
- **Don't** hide coverage behind ornamental cards.
- **Don't** use gradient text, decorative glassmorphism, or colored side-stripe borders thicker than one pixel.
- **Don't** use display fonts in labels, buttons, tables, navigation, or data.
- **Don't** add decorative motion, orchestrated page-load sequences, bounce, or elastic easing.
- **Don't** use heavy color on inactive states or introduce a second competing action accent.
