import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SetupScreen } from '../screens/SetupScreen';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const FESTIVAL_DAYS = [{ dayIndex: 1, label: 'Friday' }];

function makeProps(overrides = {}) {
  return {
    userRole: 'founder',
    onboardingStep: 'upload_all_days',
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
    uploadDayIndex: 1,
    dayStates: { 1: { status: 'idle' } },
    onChooseDayScreenshot: jest.fn(),
    onSkipDay: jest.fn(),
    onRetryDay: jest.fn(),
    onChooseNewImage: jest.fn(),
    onDeleteDaySet: jest.fn(),
    onAddDaySet: jest.fn().mockResolvedValue(undefined),
    onSetDayPreference: jest.fn(),
    onEditDaySet: jest.fn(),
    onConfirmDay: jest.fn(),
    hasOfficialLineup: false,
    onBrowseFullLineup: jest.fn(),
    onboardingLineupState: 'idle',
    onboardingLineupResult: null,
    onImportOfficialSchedule: jest.fn(),
    onSkipOfficialSchedule: jest.fn(),
    onFinishSetup: jest.fn(),
    onGoBack: jest.fn(),
    onStartOver: jest.fn(),
    onSkipMemberLineupIntro: jest.fn(),
    ...overrides,
  };
}

describe('SetupScreen — upload_all_days step', () => {
  it('renders Choose Screenshot and Skip This Day buttons', () => {
    const { getByText } = render(<SetupScreen {...makeProps()} />);
    expect(getByText('Choose Screenshot')).toBeTruthy();
    expect(getByText('Skip This Day')).toBeTruthy();
  });

  it('does NOT show Browse Full Lineup when hasOfficialLineup is false', () => {
    const { queryByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: false })} />);
    expect(queryByText('Browse Full Lineup →')).toBeNull();
  });

  it('shows Browse Full Lineup button when hasOfficialLineup is true', () => {
    const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: true })} />);
    expect(getByText('Browse Full Lineup →')).toBeTruthy();
  });

  it('calls onBrowseFullLineup when Browse Full Lineup is pressed', () => {
    const onBrowseFullLineup = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ hasOfficialLineup: true, onBrowseFullLineup })} />
    );
    fireEvent.press(getByText('Browse Full Lineup →'));
    expect(onBrowseFullLineup).toHaveBeenCalledTimes(1);
  });

  it('shows day label in the upload step header', () => {
    const { getByText } = render(<SetupScreen {...makeProps()} />);
    expect(getByText(/Friday/)).toBeTruthy();
  });

  it('shows lineup info message when hasOfficialLineup is true', () => {
    const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: true })} />);
    expect(getByText(/The full lineup is already imported/)).toBeTruthy();
  });

  it('shows Skip for Now (not Skip This Day) when hasOfficialLineup is true', () => {
    const { getByText, queryByText } = render(
      <SetupScreen {...makeProps({ hasOfficialLineup: true })} />
    );
    expect(getByText('Skip for Now')).toBeTruthy();
    expect(queryByText('Skip This Day')).toBeNull();
  });

  it('still shows Skip This Day when hasOfficialLineup is false', () => {
    const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: false })} />);
    expect(getByText('Skip This Day')).toBeTruthy();
  });

  it('calls onSkipDay when Skip for Now is pressed (hasOfficialLineup true)', () => {
    const onSkipDay = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ hasOfficialLineup: true, onSkipDay })} />
    );
    fireEvent.press(getByText('Skip for Now'));
    expect(onSkipDay).toHaveBeenCalledTimes(1);
  });
});

describe('SetupScreen — festival_setup step', () => {
  it('helper text includes example day names', () => {
    const { getByText } = render(
      <SetupScreen {...makeProps({ onboardingStep: 'festival_setup' })} />
    );
    expect(getByText(/e\.g\. "Friday", "Saturday", "Sunday"/)).toBeTruthy();
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

describe('SetupScreen — member_lineup_intro step', () => {
  function makeIntroProps(overrides = {}) {
    return makeProps({ onboardingStep: 'member_lineup_intro', ...overrides });
  }

  it('renders Schedule is Ready title', () => {
    const { getByText } = render(<SetupScreen {...makeIntroProps()} />);
    expect(getByText('Schedule is Ready')).toBeTruthy();
  });

  it('renders Go to Group Schedule as primary button', () => {
    const { getByText } = render(<SetupScreen {...makeIntroProps()} />);
    expect(getByText('Go to Group Schedule →')).toBeTruthy();
  });

  it('renders Upload my own screenshots as secondary button', () => {
    const { getByText } = render(<SetupScreen {...makeIntroProps()} />);
    expect(getByText('Upload my own screenshots →')).toBeTruthy();
  });

  it('calls onFinishSetup when primary button pressed', () => {
    const onFinishSetup = jest.fn();
    const { getByText } = render(<SetupScreen {...makeIntroProps({ onFinishSetup })} />);
    fireEvent.press(getByText('Go to Group Schedule →'));
    expect(onFinishSetup).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipMemberLineupIntro when secondary button pressed', () => {
    const onSkipMemberLineupIntro = jest.fn();
    const { getByText } = render(<SetupScreen {...makeIntroProps({ onSkipMemberLineupIntro })} />);
    fireEvent.press(getByText('Upload my own screenshots →'));
    expect(onSkipMemberLineupIntro).toHaveBeenCalledTimes(1);
  });
});
