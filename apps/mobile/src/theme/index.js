export const lightColors = {
  // App chrome
  bg: '#fff2e8',
  surface: '#ffffff',
  surfaceTinted: '#fff0e0',

  // Header (replaced by gradientHeader for LinearGradient usage)
  headerText: '#ffffff',

  // Gradients (pass to LinearGradient colors prop)
  gradientHeader: ['#ff6b00', '#ff2d78'],
  gradientPrimary: ['#ff6b00', '#ffb800'],
  primaryShadow: 'rgba(255, 107, 0, 0.4)',

  // Primary
  primary: '#ff6b00',
  primaryBg: '#fff0e0',
  primaryText: '#ffffff',

  // Secondary button
  btnSecondaryBg: '#e8f2ff',
  btnSecondaryBorder: '#7ab0f0',
  btnSecondaryText: '#1a4fa0',

  // Menu
  menuOverlayBg: 'rgba(80, 20, 0, 0.35)',
  menuCardBg: '#ffffff',
  menuCardBorder: '#ffc8a0',
  menuItemBg: '#fff8f2',
  menuItemBorder: '#ffc8a0',
  menuLabelText: '#a07050',
  menuItemText: '#1e0800',

  // Invite card (in menu)
  inviteCardBg: '#fff0e0',
  inviteCardBorder: '#ffc8a0',
  inviteLabel: '#cc4400',
  inviteCode: '#1e0800',
  copiedText: '#cc4400',

  // Text
  text: '#1e0800',
  textSec: '#a07050',
  textMuted: '#c07840',

  // Input
  inputBg: '#ffffff',
  inputBorder: '#ffc8a0',

  // Error / success / warning
  error: '#c62828',
  errorBg: '#ffebee',
  errorBorder: '#ef9a9a',
  success: '#2e7d32',
  successBg: '#e8f5e9',
  successBorder: '#a5d6a7',
  warning: '#7a5a00',
  warningBg: '#fff8e1',
  warningBorder: '#e8c89a',

  // Grid
  gridBg: '#fff8f2',
  gridTimeBg: '#fff0e0',
  gridStageBg: '#fff8f2',
  gridBorder: '#e8c8a0',
  gridRowLine: '#f5d8b8',
  gridTimeText: '#c07840',
  gridHeaderText: '#8a3800',

  // Set cards (the colored bubbles in the grid)
  setCardBg: '#fff4e8',
  setCardBorder: '#e8b888',
  setCardText: '#5a2800',
  setCardTimeTxt: '#c07040',
  setCardSummaryTxt: '#c07040',

  // Popularity tiers
  tierHighBg: '#e3f9ea',
  tierHighBorder: '#45b066',
  tierMidBg: '#fffbe0',
  tierMidBorder: '#c9a500',
  tierLowBg: '#fff4e8',
  tierLowBorder: '#e8b888',

  // Per-user attendance card highlighting
  myAttendanceMaybeBg: '#edf5f2',
  myAttendanceMaybeBorder: '#b5cfc8',
  myAttendanceDefBg: '#d6ede6',
  myAttendanceDefBorder: '#8ab8ad',

  // Attendee bubble
  attendeeBg: '#ff6b00',
  attendeeText: '#ffffff',

  // Modal
  modalOverlay: 'rgba(80, 20, 0, 0.45)',
  modalBg: '#ffffff',
  modalBorder: '#ffc8a0',
  modalTitle: '#1e0800',
  modalSubtitle: '#a07050',
  modalSectionTitle: '#5a2800',
  modalEmpty: '#c07840',
  modalName: '#1e0800',

  // Chip / filters
  chipSelectedBorder: '#ff6b00',
  resetBtnText: '#ff6b00',
  resetBtnUnderline: '#ffb800',

  // Preference buttons
  prefBtnBg: '#fff4e8',
  prefBtnBorder: '#ffc8a0',
  prefBtnText: '#a07050',
  prefBtnActiveBg: '#fff0e0',
  prefBtnActiveBorder: '#ff6b00',
  prefBtnActiveText: '#1e0800',

  // Edit/action buttons on set cards
  editBtnBg: '#fff0e0',
  editBtnBorder: '#ffc8a0',
  editBtnText: '#cc4400',

  // Status dots
  offlineDot: '#e0963a',
  pendingDot: '#a0b8d8',

  // Hamburger menu button (sits on gradient header — semi-transparent white)
  menuBtnBg: 'rgba(255, 255, 255, 0.2)',
  menuBtnBorder: 'rgba(255, 255, 255, 0.4)',
  menuBtnText: '#ffffff',

  // Tabs
  tabBg: '#fff4e8',
  tabBorder: '#ffc8a0',
  tabText: '#a07050',
  tabActiveBg: '#fff0e0',
  tabActiveBorder: '#ff6b00',
  tabActiveText: '#1e0800',

  // Inline invite row (inside group schedule screen)
  inviteRowText: '#a07050',
  inviteRowCode: '#cc4400',

  // Setup screen color swatch selected border
  swatchSelectedBorder: '#ff6b00',
  swatchDefaultBorder: '#ffc8a0',

  // Card backgrounds in setup/edit screens
  cardBg: '#ffffff',
  cardBorder: '#ffc8a0',
  stepCardBg: '#fff8f2',
  stepCardBorder: '#ffc8a0',
  kickerText: '#cc4400',
  headingText: '#1e0800',
  labelText: '#a07050',
  helperText: '#c07840',
  fieldLabelText: '#a05020',

  // Set row in lists
  setRowBg: '#fff8f2',
  setRowBorder: '#ffc8a0',
  setRowTitle: '#1e0800',

  // Add artist card
  addCardBg: '#fff0e0',
  addCardBorder: '#ffc8a0',
  addCardLabel: '#cc4400',
};

export function useTheme() {
  return lightColors;
}
