import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { MoreSheet } from '../components/MoreSheet';

function makeProps(overrides = {}) {
  return {
    visible: true,
    onClose: jest.fn(),
    inviteCode: null,
    inviteCopied: false,
    onCopyInvite: jest.fn(),
    onIndividualSchedules: jest.fn(),
    isFounder: false,
    onFounderTools: null,
    onResetApp: jest.fn(),
    onDeleteMyData: null,
    currentDisplayName: 'Chris',
    currentChipColor: '#4D73FF',
    chipColorOptions: ['#4D73FF', '#20A36B'],
    takenColors: [],
    onSaveProfile: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('MoreSheet — profile editing', () => {
  it('saves the display name from the keyboard submit action', async () => {
    const onSaveProfile = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByPlaceholderText } = render(
      <MoreSheet {...makeProps({ onSaveProfile })} />
    );

    fireEvent.press(getByText('Edit Profile'));
    const input = getByPlaceholderText('Your name');
    fireEvent.changeText(input, 'Chris Updated');
    await act(async () => {
      fireEvent(input, 'submitEditing');
    });

    expect(onSaveProfile).toHaveBeenCalledWith('Chris Updated', '#4D73FF');
  });

  it('disables autocorrect on the display name input', () => {
    const { getByText, getByPlaceholderText } = render(<MoreSheet {...makeProps()} />);

    fireEvent.press(getByText('Edit Profile'));

    expect(getByPlaceholderText('Your name').props.autoCorrect).toBe(false);
  });
});
