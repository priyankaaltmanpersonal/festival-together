# Sunset Theme Design Spec
**Date:** 2026-04-03  
**Status:** Approved

## Goal

Replace the current purple/indigo monochrome palette with a warm sunset theme (oranges, yellows, pinks, soft blues). Drop dark mode support entirely — always render the light palette.

## Dependency

Install `expo-linear-gradient` (standard Expo package). Required for the gradient header and primary buttons.

## Color Token Changes

All tokens live in `apps/mobile/src/theme/index.js`. The `darkColors` export and the `useColorScheme` branch in `useTheme()` are removed. `useTheme()` always returns `lightColors`.

| Token | Old value | New value |
|---|---|---|
| `bg` | `#f5f3fa` | `#fff2e8` |
| `surface` | `#ffffff` | `#ffffff` |
| `surfaceTinted` | `#ede9ff` | `#fff0e0` |
| `headerBg` | `#4a3db5` | _(replaced by `gradientHeader` array)_ |
| `headerText` | `#ffffff` | `#ffffff` |
| `primary` | `#4a3db5` | `#ff6b00` |
| `primaryBg` | `#ede9ff` | `#fff0e0` |
| `primaryText` | `#ffffff` | `#ffffff` |
| `btnSecondaryBg` | `#f0eeff` | `#e8f2ff` |
| `btnSecondaryBorder` | `#c0b8f0` | `#7ab0f0` |
| `btnSecondaryText` | `#4a3db5` | `#1a4fa0` |
| `text` | `#1a1638` | `#1e0800` |
| `textSec` | `#5a5480` | `#a07050` |
| `textMuted` | `#8e8aac` | `#c07840` |
| `inputBg` | `#ffffff` | `#ffffff` |
| `inputBorder` | `#cdc9e8` | `#ffc8a0` |
| `cardBg` | `#ffffff` | `#ffffff` |
| `cardBorder` | `#ddd8f8` | `#ffc8a0` |
| `stepCardBg` | `#faf8ff` | `#fff8f2` |
| `stepCardBorder` | `#cdc9e8` | `#ffc8a0` |
| `kickerText` | `#6e68a0` | `#cc4400` |
| `headingText` | `#1a1638` | `#1e0800` |
| `labelText` | `#5a5480` | `#a07050` |
| `helperText` | `#8e8aac` | `#c07840` |
| `fieldLabelText` | `#5a5480` | `#a05020` |
| `gridBg` | `#faf8ff` | `#fff8f2` |
| `gridTimeBg` | `#f0edff` | `#fff0e0` |
| `gridStageBg` | `#faf8ff` | `#fff8f2` |
| `gridBorder` | `#cdc9e8` | `#e8c8a0` |
| `gridRowLine` | `#e8e4ff` | `#f5d8b8` |
| `gridTimeText` | `#5a5480` | `#c07840` |
| `gridHeaderText` | `#2a2650` | `#8a3800` |
| `setCardBg` | `#eeebff` | `#fff4e8` |
| `setCardBorder` | `#b8b0f0` | `#e8b888` |
| `setCardText` | `#1a1638` | `#5a2800` |
| `setCardTimeTxt` | `#6e68a0` | `#c07040` |
| `setCardSummaryTxt` | `#5a5480` | `#c07040` |
| `tierLowBg` | `#f0eeff` | `#fff4e8` |
| `tierLowBorder` | `#9e98cc` | `#e8b888` |
| `tierHighBg` | `#e3f9ea` | `#e3f9ea` _(unchanged)_ |
| `tierHighBorder` | `#45b066` | `#45b066` _(unchanged)_ |
| `tierMidBg` | `#fffbe0` | `#fffbe0` _(unchanged)_ |
| `tierMidBorder` | `#c9a500` | `#c9a500` _(unchanged)_ |
| `attendeeBg` | `#4a3db5` | `#ff6b00` |
| `attendeeText` | `#ffffff` | `#ffffff` |
| `chipSelectedBorder` | `#4a3db5` | `#ff6b00` |
| `resetBtnText` | `#4a3db5` | `#ff6b00` |
| `resetBtnUnderline` | `#9390d0` | `#ffb800` |
| `inviteRowText` | `#5a5480` | `#a07050` |
| `inviteRowCode` | `#4a3db5` | `#cc4400` |
| `swatchSelectedBorder` | `#4a3db5` | `#ff6b00` |
| `swatchDefaultBorder` | `#cdc9e8` | `#ffc8a0` |
| `menuBtnBg` | `#f0eeff` | `rgba(255,255,255,0.2)` |
| `menuBtnBorder` | `#c0b8f0` | `rgba(255,255,255,0.4)` |
| `menuBtnText` | `#4a3db5` | `#ffffff` |
| `tabBg` | `#f8f6ff` | `#fff4e8` |
| `tabBorder` | `#c0b8f0` | `#ffc8a0` |
| `tabText` | `#5a5480` | `#a07050` |
| `tabActiveBg` | `#ede9ff` | `#fff0e0` |
| `tabActiveBorder` | `#4a3db5` | `#ff6b00` |
| `tabActiveText` | `#1a1638` | `#1e0800` |
| `editBtnBg` | `#f0eeff` | `#fff0e0` |
| `editBtnBorder` | `#c0b8f0` | `#ffc8a0` |
| `editBtnText` | `#4a3db5` | `#cc4400` |
| `prefBtnBg` | `#f5f3ff` | `#fff4e8` |
| `prefBtnBorder` | `#c0b8f0` | `#ffc8a0` |
| `prefBtnText` | `#4e4e7a` | `#a07050` |
| `prefBtnActiveBg` | `#ede9ff` | `#fff0e0` |
| `prefBtnActiveBorder` | `#4a3db5` | `#ff6b00` |
| `prefBtnActiveText` | `#1a1638` | `#1e0800` |
| `addCardBg` | `#f0eeff` | `#fff0e0` |
| `addCardBorder` | `#c0b8f0` | `#ffc8a0` |
| `addCardLabel` | `#4a3db5` | `#cc4400` |
| `setRowBg` | `#faf8ff` | `#fff8f2` |
| `setRowBorder` | `#ddd8f8` | `#ffc8a0` |
| `setRowTitle` | `#1a1638` | `#1e0800` |
| `menuOverlayBg` | `rgba(15,10,50,0.35)` | `rgba(80,20,0,0.35)` |
| `menuCardBg` | `#ffffff` | `#ffffff` |
| `menuCardBorder` | `#ddd8f8` | `#ffc8a0` |
| `menuItemBg` | `#f8f6ff` | `#fff8f2` |
| `menuItemBorder` | `#ddd8f8` | `#ffc8a0` |
| `menuLabelText` | `#6e68a0` | `#a07050` |
| `menuItemText` | `#2a2650` | `#1e0800` |
| `inviteCardBg` | `#ede9ff` | `#fff0e0` |
| `inviteCardBorder` | `#b8b0f0` | `#ffc8a0` |
| `inviteLabel` | `#4a3db5` | `#cc4400` |
| `inviteCode` | `#1a1638` | `#1e0800` |
| `copiedText` | `#4a3db5` | `#cc4400` |
| `modalOverlay` | `rgba(15,10,50,0.45)` | `rgba(80,20,0,0.45)` |
| `modalBg` | `#ffffff` | `#ffffff` |
| `modalBorder` | `#ddd8f8` | `#ffc8a0` |
| `modalTitle` | `#1a1638` | `#1e0800` |
| `modalSubtitle` | `#6e68a0` | `#a07050` |
| `modalSectionTitle` | `#2a2650` | `#5a2800` |
| `modalEmpty` | `#8e8aac` | `#c07840` |
| `modalName` | `#2a2650` | `#1e0800` |

### New tokens to add

```js
gradientHeader: ['#ff6b00', '#ff2d78'],  // used with LinearGradient start={x:0,y:0} end={x:1,y:1}
gradientPrimary: ['#ff6b00', '#ffb800'], // used with LinearGradient start={x:0,y:0} end={x:1,y:1}
primaryShadow: 'rgba(255, 107, 0, 0.4)', // elevation shadow color for primary buttons
```

### Tokens left unchanged (error/success/warning)

`error`, `errorBg`, `errorBorder`, `success`, `successBg`, `successBorder`, `warning`, `warningBg`, `warningBorder`, `offlineDot`, `pendingDot` — all unchanged.

## Structural Changes

### `App.js` — Gradient header

Replace the header `<View>` with `<LinearGradient>`:

```jsx
// Before
<View style={styles.header}>...</View>

// After
import { LinearGradient } from 'expo-linear-gradient';
<LinearGradient colors={C.gradientHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
  ...
</LinearGradient>
```

Remove `backgroundColor: C.headerBg` from `styles.header` (LinearGradient provides the background).

### `SetupScreen.js` — Gradient primary buttons

`ActionButton` wraps primary buttons in `LinearGradient`:

```jsx
// Primary button becomes:
<Pressable disabled={disabled} onPress={onPress} style={[styles.buttonPrimaryWrap, large && styles.buttonLarge, disabled && styles.buttonDisabled]}>
  <LinearGradient colors={C.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonPrimaryGradient}>
    <Text style={[styles.buttonText, large && styles.buttonTextLarge]}>{label}</Text>
  </LinearGradient>
</Pressable>
```

Split `buttonPrimary` into `buttonPrimaryWrap` (handles border-radius, disabled opacity, sizing) and `buttonPrimaryGradient` (fills the wrap, applies border-radius, centers text).

Secondary buttons remain `<Pressable>` with flat `backgroundColor: C.btnSecondaryBg` — no gradient.

## Files to Touch

1. `apps/mobile/src/theme/index.js` — token updates + remove dark mode
2. `apps/mobile/App.js` — import LinearGradient, gradient header
3. `apps/mobile/src/screens/SetupScreen.js` — import LinearGradient, gradient primary buttons

All other screens (`GroupScheduleScreen`, `EditMyScheduleScreen`, `IndividualSchedulesScreen`, `FounderToolsScreen`, `PrivacyScreen`, `DayTabReview`, `EditableSetCard`) update automatically via theme token changes — no structural changes needed.

## What Does NOT Change

- Attendee chip colors (user-chosen, not theme-controlled)
- High-tier (green) and mid-tier (gold) set card colors
- Error/success/warning colors
- Grid layout and component structure
- Any backend or API logic
