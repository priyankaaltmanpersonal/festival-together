import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SetupScreen } from '../screens/SetupScreen';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const FESTIVAL_DAYS = [{ dayIndex: 1, label: 'Friday' }];

const PRESETS = [
  { id: 'coachella_2026_w1', label: 'Coachella 2026 — Weekend 1', days: [{ day_index: 1, label: 'Friday' }, { day_index: 2, label: 'Saturday' }, { day_index: 3, label: 'Sunday' }] },
  { id: 'coachella_2026_w2', label: 'Coachella 2026 — Weekend 2', days: [{ day_index: 1, label: 'Friday' }, { day_index: 2, label: 'Saturday' }, { day_index: 3, label: 'Sunday' }] },
];

function makeProps(overrides = {}) {
  return {
    userRole: 'founder',
    onboardingStep: 'festival_setup',
    displayName: 'Test User',
    setDisplayName: jest.fn(),
    groupName: 'Test Crew',
    setGroupName: jest.fn(),
    inviteCodeInput: '',
    setInviteCodeInput: jest.fn(),
    selectedChipColor: '#4D73FF',
    setSelectedChipColor: jest.fn(),
    chipColorOptions: ['#4D73FF'],
    availableJoinColors: [],
    festivalDays: FESTIVAL_DAYS,
    setFestivalDayLabel: jest.fn(),
    onAddFestivalDay: jest.fn(),
    onRemoveFestivalDay: jest.fn(),
    loading: false,
    error: '',
    onBeginProfile: jest.fn(),
    onCompleteFestivalSetup: jest.fn(),
    onResetFlow: jest.fn(),
    onChoosePath: jest.fn(),
    onboardingLineupState: 'idle',
    onboardingLineupResult: null,
    onImportOfficialSchedule: jest.fn(),
    onImportFromPreset: jest.fn(),
    availablePresets: [],
    pendingPresetId: null,
    onChoosePresetForSetup: jest.fn(),
    onClearPresetForSetup: jest.fn(),
    onSkipOfficialSchedule: jest.fn(),
    onFinishSetup: jest.fn(),
    onGoBack: jest.fn(),
    onStartOver: jest.fn(),
    ...overrides,
  };
}

describe('SetupScreen — festival_setup step (no presets)', () => {
  it('shows manual day entry when no presets available', () => {
    const { getByText } = render(<SetupScreen {...makeProps()} />);
    expect(getByText(/e\.g\. "Friday", "Saturday", "Sunday"/)).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });

  it('calls onCompleteFestivalSetup when Continue pressed', () => {
    const onCompleteFestivalSetup = jest.fn();
    const { getByText } = render(<SetupScreen {...makeProps({ onCompleteFestivalSetup })} />);
    fireEvent.press(getByText('Continue'));
    expect(onCompleteFestivalSetup).toHaveBeenCalledTimes(1);
  });
});

describe('SetupScreen — festival_setup step (with presets)', () => {
  it('shows preset buttons when availablePresets is provided', () => {
    const { getByText } = render(
      <SetupScreen {...makeProps({ availablePresets: PRESETS })} />
    );
    expect(getByText('Coachella 2026 — Weekend 1')).toBeTruthy();
    expect(getByText('Coachella 2026 — Weekend 2')).toBeTruthy();
  });

  it('calls onChoosePresetForSetup with correct id when preset tapped', () => {
    const onChoosePresetForSetup = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ availablePresets: PRESETS, onChoosePresetForSetup })} />
    );
    fireEvent.press(getByText('Coachella 2026 — Weekend 1'));
    expect(onChoosePresetForSetup).toHaveBeenCalledWith('coachella_2026_w1');
  });

  it('shows manual day entry section below preset buttons', () => {
    const { getByText } = render(
      <SetupScreen {...makeProps({ availablePresets: PRESETS })} />
    );
    expect(getByText(/or enter days manually/i)).toBeTruthy();
  });

  it('shows selected preset confirmation and days when pendingPresetId is set', () => {
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          availablePresets: PRESETS,
          pendingPresetId: 'coachella_2026_w1',
          festivalDays: [
            { dayIndex: 1, label: 'Friday' },
            { dayIndex: 2, label: 'Saturday' },
            { dayIndex: 3, label: 'Sunday' },
          ],
        })}
      />
    );
    expect(getByText(/Coachella 2026 — Weekend 1/)).toBeTruthy();
    expect(getByText(/Friday.*Saturday.*Sunday/)).toBeTruthy();
    expect(getByText('Continue →')).toBeTruthy();
  });

  it('calls onClearPresetForSetup when Change pressed', () => {
    const onClearPresetForSetup = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          availablePresets: PRESETS,
          pendingPresetId: 'coachella_2026_w1',
          onClearPresetForSetup,
        })}
      />
    );
    fireEvent.press(getByText('Change'));
    expect(onClearPresetForSetup).toHaveBeenCalledTimes(1);
  });

  it('calls onCompleteFestivalSetup when Continue → pressed with preset', () => {
    const onCompleteFestivalSetup = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          availablePresets: PRESETS,
          pendingPresetId: 'coachella_2026_w1',
          onCompleteFestivalSetup,
        })}
      />
    );
    fireEvent.press(getByText('Continue →'));
    expect(onCompleteFestivalSetup).toHaveBeenCalledTimes(1);
  });
});

describe('SetupScreen — upload_official_schedule step', () => {
  function makeOfficialProps(overrides = {}) {
    return makeProps({ onboardingStep: 'upload_official_schedule', ...overrides });
  }

  it('renders title and Upload + skip buttons in idle state', () => {
    const { getByText } = render(<SetupScreen {...makeOfficialProps()} />);
    expect(getByText('Import Official Schedule')).toBeTruthy();
    expect(getByText('Upload Schedule Images')).toBeTruthy();
    expect(getByText('Skip for Now — upload from Founder Tools after setup')).toBeTruthy();
  });

  it('renders spinner and help text when uploading', () => {
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onboardingLineupState: 'uploading' })} />
    );
    expect(getByText(/Importing lineup/)).toBeTruthy();
    expect(getByText(/keep the app open/)).toBeTruthy();
  });

  it('renders success text and Go to Group Schedule button (no skip) on full done', () => {
    const { getByText, queryByText } = render(
      <SetupScreen
        {...makeOfficialProps({
          onboardingLineupState: 'done',
          onboardingLineupResult: { sets_created: 80, days_processed: ['Friday', 'Saturday', 'Sunday'] },
          festivalDays: [
            { dayIndex: 1, label: 'Friday' },
            { dayIndex: 2, label: 'Saturday' },
            { dayIndex: 3, label: 'Sunday' },
          ],
        })}
      />
    );
    expect(getByText(/80 sets imported/)).toBeTruthy();
    expect(getByText('Go to Group Schedule →')).toBeTruthy();
    expect(queryByText(/Skip/)).toBeNull();
  });

  it('renders amber warning listing missing days on partial done', () => {
    const { getByText } = render(
      <SetupScreen
        {...makeOfficialProps({
          onboardingLineupState: 'done',
          onboardingLineupResult: { sets_created: 30, days_processed: ['Friday'] },
          festivalDays: [
            { dayIndex: 1, label: 'Friday' },
            { dayIndex: 2, label: 'Saturday' },
          ],
        })}
      />
    );
    expect(getByText(/30 sets imported/)).toBeTruthy();
    expect(getByText(/Couldn't read: Saturday/)).toBeTruthy();
    expect(getByText(/Founder Tools/)).toBeTruthy();
  });

  it('renders error message with retry/skip and Founder Tools hint on error', () => {
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onboardingLineupState: 'error', error: 'Upload failed' })} />
    );
    expect(getByText('Try Again')).toBeTruthy();
    expect(getByText('Skip for Now')).toBeTruthy();
    expect(getByText(/retry.*Founder Tools/i)).toBeTruthy();
  });

  it('calls onImportOfficialSchedule when Upload button pressed', () => {
    const onImportOfficialSchedule = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onImportOfficialSchedule })} />
    );
    fireEvent.press(getByText('Upload Schedule Images'));
    expect(onImportOfficialSchedule).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipOfficialSchedule when skip button pressed (idle)', () => {
    const onSkipOfficialSchedule = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onSkipOfficialSchedule })} />
    );
    fireEvent.press(getByText('Skip for Now — upload from Founder Tools after setup'));
    expect(onSkipOfficialSchedule).toHaveBeenCalledTimes(1);
  });

  it('calls onFinishSetup when Go to Group Schedule pressed (done state)', () => {
    const onFinishSetup = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeOfficialProps({
          onFinishSetup,
          onboardingLineupState: 'done',
          onboardingLineupResult: { sets_created: 10, days_processed: ['Friday'] },
          festivalDays: [{ dayIndex: 1, label: 'Friday' }],
        })}
      />
    );
    fireEvent.press(getByText('Go to Group Schedule →'));
    expect(onFinishSetup).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipOfficialSchedule when Skip for Now pressed (error state)', () => {
    const onSkipOfficialSchedule = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeOfficialProps({ onSkipOfficialSchedule, onboardingLineupState: 'error', error: 'Upload failed' })}
      />
    );
    fireEvent.press(getByText('Skip for Now'));
    expect(onSkipOfficialSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('SetupScreen — back navigation', () => {
  it('upload_official_schedule shows ← Back and Start over', () => {
    const onGoBack = jest.fn();
    const onStartOver = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ onboardingStep: 'upload_official_schedule', onGoBack, onStartOver })} />
    );
    fireEvent.press(getByText('← Back'));
    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(getByText('Start over')).toBeTruthy();
  });
});
