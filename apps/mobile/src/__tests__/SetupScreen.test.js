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
