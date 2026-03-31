import { useColorScheme } from 'react-native';

export const lightColors = {
  // App chrome
  bg: '#f5f3fa',
  surface: '#ffffff',
  surfaceTinted: '#ede9ff',

  // Header
  headerBg: '#4a3db5',
  headerText: '#ffffff',

  // Primary
  primary: '#4a3db5',
  primaryBg: '#ede9ff',
  primaryText: '#ffffff',

  // Secondary button
  btnSecondaryBg: '#f0eeff',
  btnSecondaryBorder: '#c0b8f0',
  btnSecondaryText: '#4a3db5',

  // Menu
  menuOverlayBg: 'rgba(15, 10, 50, 0.35)',
  menuCardBg: '#ffffff',
  menuCardBorder: '#ddd8f8',
  menuItemBg: '#f8f6ff',
  menuItemBorder: '#ddd8f8',
  menuLabelText: '#6e68a0',
  menuItemText: '#2a2650',

  // Invite card (in menu)
  inviteCardBg: '#ede9ff',
  inviteCardBorder: '#b8b0f0',
  inviteLabel: '#4a3db5',
  inviteCode: '#1a1638',
  copiedText: '#4a3db5',

  // Text
  text: '#1a1638',
  textSec: '#5a5480',
  textMuted: '#8e8aac',

  // Input
  inputBg: '#ffffff',
  inputBorder: '#cdc9e8',

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
  gridBg: '#faf8ff',
  gridTimeBg: '#f0edff',
  gridStageBg: '#faf8ff',
  gridBorder: '#cdc9e8',
  gridRowLine: '#e8e4ff',
  gridTimeText: '#5a5480',
  gridHeaderText: '#2a2650',

  // Set cards (the colored bubbles in the grid)
  setCardBg: '#eeebff',
  setCardBorder: '#b8b0f0',
  setCardText: '#1a1638',
  setCardTimeTxt: '#6e68a0',
  setCardSummaryTxt: '#5a5480',

  // Popularity tiers
  tierHighBg: '#e3f9ea',
  tierHighBorder: '#45b066',
  tierMidBg: '#fffbe0',
  tierMidBorder: '#c9a500',
  tierLowBg: '#f0eeff',
  tierLowBorder: '#9e98cc',

  // Attendee bubble
  attendeeBg: '#4a3db5',
  attendeeText: '#ffffff',

  // Modal
  modalOverlay: 'rgba(15, 10, 50, 0.45)',
  modalBg: '#ffffff',
  modalBorder: '#ddd8f8',
  modalTitle: '#1a1638',
  modalSubtitle: '#6e68a0',
  modalSectionTitle: '#2a2650',
  modalEmpty: '#8e8aac',
  modalName: '#2a2650',

  // Chip / filters
  chipSelectedBorder: '#4a3db5',
  resetBtnText: '#4a3db5',
  resetBtnUnderline: '#9390d0',

  // Preference buttons
  prefBtnBg: '#f5f3ff',
  prefBtnBorder: '#c0b8f0',
  prefBtnText: '#4e4e7a',
  prefBtnActiveBg: '#ede9ff',
  prefBtnActiveBorder: '#4a3db5',
  prefBtnActiveText: '#1a1638',

  // Edit/action buttons on set cards
  editBtnBg: '#f0eeff',
  editBtnBorder: '#c0b8f0',
  editBtnText: '#4a3db5',

  // Status dots
  offlineDot: '#e0963a',
  pendingDot: '#a0b8d8',

  // Hamburger menu button
  menuBtnBg: '#f0eeff',
  menuBtnBorder: '#c0b8f0',
  menuBtnText: '#4a3db5',

  // Tabs
  tabBg: '#f8f6ff',
  tabBorder: '#c0b8f0',
  tabText: '#5a5480',
  tabActiveBg: '#ede9ff',
  tabActiveBorder: '#4a3db5',
  tabActiveText: '#1a1638',

  // Inline invite row (inside group schedule screen)
  inviteRowText: '#5a5480',
  inviteRowCode: '#4a3db5',

  // Setup screen color swatch selected border
  swatchSelectedBorder: '#4a3db5',
  swatchDefaultBorder: '#cdc9e8',

  // Card backgrounds in setup/edit screens
  cardBg: '#ffffff',
  cardBorder: '#ddd8f8',
  stepCardBg: '#faf8ff',
  stepCardBorder: '#cdc9e8',
  kickerText: '#6e68a0',
  headingText: '#1a1638',
  labelText: '#5a5480',
  helperText: '#8e8aac',
  fieldLabelText: '#5a5480',

  // Set row in lists
  setRowBg: '#faf8ff',
  setRowBorder: '#ddd8f8',
  setRowTitle: '#1a1638',

  // Add artist card
  addCardBg: '#f0eeff',
  addCardBorder: '#c0b8f0',
  addCardLabel: '#4a3db5',
};

export const darkColors = {
  // App chrome
  bg: '#12101f',
  surface: '#1e1b30',
  surfaceTinted: '#262244',

  // Header
  headerBg: '#1e1b30',
  headerText: '#e8e4ff',

  // Primary
  primary: '#b0a4ff',
  primaryBg: '#2e2a50',
  primaryText: '#12101f',

  // Secondary button
  btnSecondaryBg: '#262244',
  btnSecondaryBorder: '#4a4480',
  btnSecondaryText: '#b0a4ff',

  // Menu
  menuOverlayBg: 'rgba(0, 0, 0, 0.55)',
  menuCardBg: '#1e1b30',
  menuCardBorder: '#3a3660',
  menuItemBg: '#262244',
  menuItemBorder: '#3a3660',
  menuLabelText: '#8e8ab0',
  menuItemText: '#d8d4f8',

  // Invite card (in menu)
  inviteCardBg: '#262244',
  inviteCardBorder: '#4a4480',
  inviteLabel: '#b0a4ff',
  inviteCode: '#e8e4ff',
  copiedText: '#b0a4ff',

  // Text
  text: '#e8e4ff',
  textSec: '#a8a0cc',
  textMuted: '#6e6888',

  // Input
  inputBg: '#262244',
  inputBorder: '#4a4480',

  // Error / success / warning
  error: '#ef9a9a',
  errorBg: '#2d1515',
  errorBorder: '#7a2a2a',
  success: '#a5d6a7',
  successBg: '#1a2f1a',
  successBorder: '#3a6a3a',
  warning: '#ffe082',
  warningBg: '#3d3010',
  warningBorder: '#8a6a10',

  // Grid
  gridBg: '#12101f',
  gridTimeBg: '#1a1828',
  gridStageBg: '#12101f',
  gridBorder: '#3a3660',
  gridRowLine: '#262244',
  gridTimeText: '#a8a0cc',
  gridHeaderText: '#d8d4f8',

  // Set cards (bubbles)
  setCardBg: '#232040',
  setCardBorder: '#3a3660',
  setCardText: '#e8e4ff',
  setCardTimeTxt: '#8e8ab0',
  setCardSummaryTxt: '#a8a0cc',

  // Popularity tiers
  tierHighBg: '#1a3828',
  tierHighBorder: '#4caf7a',
  tierMidBg: '#3a2e08',
  tierMidBorder: '#c9a500',
  tierLowBg: '#232040',
  tierLowBorder: '#5a5480',

  // Attendee bubble
  attendeeBg: '#7060d8',
  attendeeText: '#ffffff',

  // Modal
  modalOverlay: 'rgba(0, 0, 0, 0.65)',
  modalBg: '#1e1b30',
  modalBorder: '#3a3660',
  modalTitle: '#e8e4ff',
  modalSubtitle: '#8e8ab0',
  modalSectionTitle: '#d8d4f8',
  modalEmpty: '#6e6888',
  modalName: '#d8d4f8',

  // Chip / filters
  chipSelectedBorder: '#b0a4ff',
  resetBtnText: '#b0a4ff',
  resetBtnUnderline: '#6060a0',

  // Preference buttons
  prefBtnBg: '#262244',
  prefBtnBorder: '#4a4480',
  prefBtnText: '#a8a0cc',
  prefBtnActiveBg: '#2e2a50',
  prefBtnActiveBorder: '#b0a4ff',
  prefBtnActiveText: '#e8e4ff',

  // Edit/action buttons on set cards
  editBtnBg: '#262244',
  editBtnBorder: '#4a4480',
  editBtnText: '#b0a4ff',

  // Status dots
  offlineDot: '#e0963a',
  pendingDot: '#6080a0',

  // Hamburger menu button
  menuBtnBg: '#262244',
  menuBtnBorder: '#4a4480',
  menuBtnText: '#b0a4ff',

  // Tabs
  tabBg: '#1e1b30',
  tabBorder: '#3a3660',
  tabText: '#a8a0cc',
  tabActiveBg: '#2e2a50',
  tabActiveBorder: '#b0a4ff',
  tabActiveText: '#e8e4ff',

  // Inline invite row
  inviteRowText: '#a8a0cc',
  inviteRowCode: '#b0a4ff',

  // Setup screen color swatch
  swatchSelectedBorder: '#b0a4ff',
  swatchDefaultBorder: '#4a4480',

  // Card backgrounds
  cardBg: '#1e1b30',
  cardBorder: '#3a3660',
  stepCardBg: '#262244',
  stepCardBorder: '#3a3660',
  kickerText: '#8e8ab0',
  headingText: '#e8e4ff',
  labelText: '#a8a0cc',
  helperText: '#6e6888',
  fieldLabelText: '#a8a0cc',

  // Set row in lists
  setRowBg: '#262244',
  setRowBorder: '#3a3660',
  setRowTitle: '#e8e4ff',

  // Add artist card
  addCardBg: '#262244',
  addCardBorder: '#4a4480',
  addCardLabel: '#b0a4ff',
};

export function useTheme() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
