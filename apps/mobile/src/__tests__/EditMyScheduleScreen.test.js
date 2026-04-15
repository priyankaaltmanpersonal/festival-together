import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EditMyScheduleScreen } from '../screens/EditMyScheduleScreen';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const FESTIVAL_DAYS = [
  { dayIndex: 1, label: 'Friday' },
  { dayIndex: 2, label: 'Saturday' },
];

const OFFICIAL_SETS = [
  {
    id: 'os-1',
    artist_name: 'Kendrick Lamar',
    stage_name: 'Coachella Stage',
    start_time_pt: '22:00',
    end_time_pt: '23:30',
    day_index: 1,
  },
  {
    id: 'os-2',
    artist_name: 'Kendrick Lamar',
    stage_name: 'Coachella Stage',
    start_time_pt: '22:00',
    end_time_pt: '23:30',
    day_index: 2,
  },
];

function makeProps(overrides = {}) {
  return {
    personalSets: [],
    festivalDays: FESTIVAL_DAYS,
    onReUploadDay: jest.fn(),
    uploadingDayIndex: null,
    onSetPreference: jest.fn(),
    onDeleteSet: jest.fn(),
    onAddSet: jest.fn().mockResolvedValue(undefined),
    onEditSet: jest.fn(),
    initialDayIndex: 1,
    uploadError: null,
    onDismissError: jest.fn(),
    officialSets: OFFICIAL_SETS,
    ...overrides,
  };
}

describe('EditMyScheduleScreen — top-level Add Artist form', () => {
  it('shows + Add Artist button when festival days are loaded', () => {
    const { getByText } = render(<EditMyScheduleScreen {...makeProps()} />);
    expect(getByText('+ Add Artist')).toBeTruthy();
  });

  it('does not show + Add Artist button when no festival days', () => {
    const { queryByText } = render(
      <EditMyScheduleScreen {...makeProps({ festivalDays: [] })} />
    );
    expect(queryByText('+ Add Artist')).toBeNull();
  });

  it('opens Add Artist form when button is pressed', async () => {
    const { getByText, getByPlaceholderText } = render(<EditMyScheduleScreen {...makeProps()} />);
    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });
    expect(getByPlaceholderText('e.g. Bad Bunny')).toBeTruthy();
  });

  it('shows Day dropdown in the top-level form', async () => {
    const { getByText, getAllByText } = render(<EditMyScheduleScreen {...makeProps()} />);
    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });
    // Day field label appears
    expect(getByText('Day')).toBeTruthy();
  });

  it('shows autocomplete suggestions across all days', async () => {
    const { getByText, getByPlaceholderText, findAllByText } = render(
      <EditMyScheduleScreen {...makeProps()} />
    );
    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });
    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Kendrick');
    // Both Friday and Saturday suggestions should appear (one per day)
    const suggestions = await findAllByText('Kendrick Lamar');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onAddSet and closes form on submit', async () => {
    const onAddSet = jest.fn().mockResolvedValue(undefined);
    const { getByText, getAllByText, getByPlaceholderText, queryByText } = render(
      <EditMyScheduleScreen {...makeProps({ onAddSet })} />
    );
    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });
    // Select the first suggestion to pre-fill all fields
    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Kendrick');
    await act(async () => {
      // Two suggestions appear (one per day); press the first
      fireEvent.press(getAllByText('Kendrick Lamar')[0]);
    });
    await act(async () => {
      fireEvent.press(getByText('Add'));
    });
    expect(onAddSet).toHaveBeenCalledTimes(1);
    // Form should be dismissed
    expect(queryByText('+ Add Artist')).toBeTruthy();
  });

  it('cancels form when Cancel is pressed', async () => {
    const { getByText, getByPlaceholderText, queryByText } = render(
      <EditMyScheduleScreen {...makeProps()} />
    );
    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });
    expect(getByPlaceholderText('e.g. Bad Bunny')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText('Cancel'));
    });
    expect(queryByText('+ Add Artist')).toBeTruthy();
  });
});
