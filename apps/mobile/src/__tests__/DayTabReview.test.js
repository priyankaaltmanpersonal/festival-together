import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { DayTabReview } from '../components/DayTabReview';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const FESTIVAL_DAYS = [
  { dayIndex: 1, label: 'Friday' },
  { dayIndex: 2, label: 'Saturday' },
];

const SET_ITEM = {
  canonical_set_id: 'set-1',
  artist_name: 'Bad Bunny',
  stage_name: 'Sahara',
  start_time_pt: '21:00',
  end_time_pt: '22:00',
  day_index: 1,
  preference: 'must_see',
};

function makeProps(overrides = {}) {
  return {
    festivalDays: FESTIVAL_DAYS,
    dayStates: {},
    onRetry: jest.fn(),
    onDeleteSet: jest.fn(),
    onAddSet: jest.fn().mockResolvedValue(undefined),
    onSetPreference: jest.fn(),
    onEditSet: jest.fn(),
    onReUpload: jest.fn(),
    onAddOpen: jest.fn(),
    onConfirmDay: jest.fn(),
    ...overrides,
  };
}

describe('DayTabReview — uploading state', () => {
  it('shows loading text and hides sets list', () => {
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'uploading', sets: [], retryCount: 0 } },
        })}
      />
    );
    expect(getByText('Analyzing your schedule…')).toBeTruthy();
    expect(queryByText('Bad Bunny')).toBeNull();
  });
});

describe('DayTabReview — failed state', () => {
  it('shows error message, Retry button, and Add Manually button', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: {
              status: 'failed',
              sets: [],
              retryCount: 0,
              errorMsg: 'Could not parse this screenshot.',
            },
          },
        })}
      />
    );
    expect(getByText(/Could not parse this screenshot/)).toBeTruthy();
    expect(getByText(/Retry Upload/)).toBeTruthy();
    expect(getByText('+ Add Manually')).toBeTruthy();
  });

  it('hides Retry button when retryCount >= 3', () => {
    const { queryByText, getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: {
              status: 'failed',
              sets: [],
              retryCount: 3,
              errorMsg: 'Could not parse this screenshot.',
            },
          },
        })}
      />
    );
    expect(queryByText(/Retry Upload/)).toBeNull();
    expect(getByText('+ Add Manually')).toBeTruthy();
  });
});

describe('DayTabReview — done state', () => {
  it('renders sets list and Confirm button', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0, confirmed: false },
          },
        })}
      />
    );
    expect(getByText('Bad Bunny')).toBeTruthy();
    expect(getByText(/Confirm Friday/)).toBeTruthy();
  });

  it('shows confirmed check instead of confirm button when confirmed=true', () => {
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0, confirmed: true },
          },
        })}
      />
    );
    expect(getByText('✓ Confirmed')).toBeTruthy();
    expect(queryByText(/Confirm Friday/)).toBeNull();
  });
});

describe('DayTabReview — idle state', () => {
  it('shows "No screenshot uploaded" message', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'idle', sets: [], retryCount: 0 } },
        })}
      />
    );
    expect(getByText('No screenshot uploaded for this day.')).toBeTruthy();
  });
});

describe('DayTabReview — tab indicators', () => {
  it('shows set count badge on done tab', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0 },
            2: { status: 'idle', sets: [], retryCount: 0 },
          },
        })}
      />
    );
    expect(getByText('1')).toBeTruthy();
  });

  it('shows error mark on failed tab', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'failed', sets: [], retryCount: 0 },
            2: { status: 'idle', sets: [], retryCount: 0 },
          },
        })}
      />
    );
    expect(getByText('!')).toBeTruthy();
  });

  it('shows ✓ on tab when day is confirmed', () => {
    const { getAllByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0, confirmed: true },
            2: { status: 'idle', sets: [], retryCount: 0 },
          },
        })}
      />
    );
    // ✓ appears in the tab indicator
    expect(getAllByText('✓').length).toBeGreaterThan(0);
  });

  it('does not show count badge when day is confirmed', () => {
    const { queryByText, getAllByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0, confirmed: true },
            2: { status: 'idle', sets: [], retryCount: 0 },
          },
        })}
      />
    );
    // Badge would show '1' for 1 set — should not appear when confirmed
    expect(queryByText('1')).toBeNull();
    // ✓ shown instead
    expect(getAllByText('✓').length).toBeGreaterThan(0);
  });
});

describe('DayTabReview — tab switching', () => {
  it('switches to Saturday content when Saturday tab is pressed', () => {
    const saturdaySet = { ...SET_ITEM, canonical_set_id: 'set-2', artist_name: 'Tyler the Creator' };
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0 },
            2: { status: 'done', sets: [saturdaySet], retryCount: 0 },
          },
        })}
      />
    );
    expect(getByText('Bad Bunny')).toBeTruthy();
    expect(queryByText('Tyler the Creator')).toBeNull();

    fireEvent.press(getByText('Saturday'));

    expect(queryByText('Bad Bunny')).toBeNull();
    expect(getByText('Tyler the Creator')).toBeTruthy();
  });
});

describe('DayTabReview — add artist on failed day regression', () => {
  it('shows artist and confirm button after parent updates day to done', async () => {
    const onAddSet = jest.fn().mockResolvedValue(undefined);

    const { getByText, getByPlaceholderText, rerender, queryByText } = render(
      <DayTabReview
        {...makeProps({
          onAddSet,
          dayStates: {
            1: { status: 'failed', sets: [], retryCount: 3, errorMsg: 'Parse failed.' },
          },
        })}
      />
    );

    fireEvent.press(getByText('+ Add Manually'));
    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Kendrick Lamar');
    fireEvent.press(getByText('Select stage…'));
    fireEvent.press(getByText('Coachella Stage'));

    await act(async () => {
      fireEvent.press(getByText('Add'));
    });

    expect(onAddSet).toHaveBeenCalledWith(
      expect.objectContaining({ artist_name: 'Kendrick Lamar', stage_name: 'Coachella Stage' }),
      1
    );
    // Form should dismiss after successful add
    expect(queryByText('e.g. Bad Bunny')).toBeNull();

    const newSet = {
      canonical_set_id: 'set-new',
      artist_name: 'Kendrick Lamar',
      stage_name: 'Coachella Stage',
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      day_index: 1,
      preference: 'flexible',
    };
    rerender(
      <DayTabReview
        {...makeProps({
          onAddSet,
          dayStates: {
            1: { status: 'done', sets: [newSet], retryCount: 3, confirmed: false },
          },
        })}
      />
    );

    expect(getByText('Kendrick Lamar')).toBeTruthy();
    expect(getByText(/Confirm Friday/)).toBeTruthy();
    expect(queryByText('Parse failed.')).toBeNull();
  });
});

describe('DayTabReview — initialSelectedDay', () => {
  it('shows day 2 content immediately without pressing any tab', () => {
    const saturdaySet = {
      ...SET_ITEM,
      canonical_set_id: 'set-sat',
      artist_name: 'Saturday Artist',
      day_index: 2,
    };
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          initialSelectedDay: 2,
          dayStates: {
            // day 1 has no sets — its content should not appear
            1: { status: 'done', sets: [], retryCount: 0 },
            2: { status: 'done', sets: [saturdaySet], retryCount: 0 },
          },
        })}
      />
    );
    // Day 2's artist should be visible without pressing any tab
    expect(getByText('Saturday Artist')).toBeTruthy();
    // Day 1 has no sets, so the Confirm Friday button for day 1 should not be visible
    expect(queryByText(/Confirm Friday/)).toBeNull();
  });
});

describe('DayTabReview — stage options', () => {
  it('includes Heineken House in the Add Artist stage dropdown', async () => {
    const { getByText, getByPlaceholderText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'done', sets: [], retryCount: 0, confirmed: false } },
        })}
      />
    );

    // Open the Add Artist form
    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });

    // Open the stage dropdown
    fireEvent.press(getByText('Select stage…'));

    // Heineken House should appear as an option
    expect(getByText('Heineken House')).toBeTruthy();
  });
});

describe('DayTabReview — autocomplete suggestions', () => {
  const officialSets = [
    {
      id: 'official-1',
      artist_name: 'Tyler the Creator',
      stage_name: 'Sahara',
      start_time_pt: '20:00',
      end_time_pt: '21:30',
      day_index: 1,
      source: 'official',
    },
    {
      id: 'official-2',
      artist_name: 'Bad Bunny',
      stage_name: 'Coachella Stage',
      start_time_pt: '23:00',
      end_time_pt: '24:30',
      day_index: 1,
      source: 'official',
    },
  ];

  it('shows matching suggestions when typing 2+ characters', async () => {
    const { getByText, getByPlaceholderText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'done', sets: [], retryCount: 0, confirmed: false } },
          officialSets,
        })}
      />
    );

    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });

    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Tyler');

    expect(getByText('Tyler the Creator')).toBeTruthy();
    expect(getByText(/Sahara/)).toBeTruthy();
  });

  it('does not show suggestions from a different day', async () => {
    const crossDaySet = { id: 'other', artist_name: 'Tyler the Creator', stage_name: 'Gobi', start_time_pt: '18:00', end_time_pt: '19:00', day_index: 2, source: 'official' };
    const { getByText, getByPlaceholderText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'done', sets: [], retryCount: 0, confirmed: false } },
          officialSets: [crossDaySet],
        })}
      />
    );

    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });

    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Tyler');

    // day_index 2 set should not appear when we're on day 1
    expect(queryByText('Tyler the Creator')).toBeNull();
  });

  it('pre-fills stage when a suggestion is selected', async () => {
    const { getByText, getByPlaceholderText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'done', sets: [], retryCount: 0, confirmed: false } },
          officialSets,
        })}
      />
    );

    await act(async () => {
      fireEvent.press(getByText('+ Add Artist'));
    });

    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Tyler');
    fireEvent.press(getByText('Tyler the Creator'));

    // Suggestions should be dismissed
    expect(queryByText(/Sahara · /)).toBeNull();

    // Stage dropdown trigger should now show the pre-filled stage
    expect(getByText('Sahara')).toBeTruthy();
  });
});

describe('DayTabReview — hideAddButton prop', () => {
  it('shows + Add Artist button by default', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'done', sets: [], retryCount: 0, confirmed: false } },
        })}
      />
    );
    expect(getByText('+ Add Artist')).toBeTruthy();
  });

  it('hides + Add Artist button when hideAddButton is true', () => {
    const { queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'done', sets: [], retryCount: 0, confirmed: false } },
          hideAddButton: true,
        })}
      />
    );
    expect(queryByText('+ Add Artist')).toBeNull();
  });
});
