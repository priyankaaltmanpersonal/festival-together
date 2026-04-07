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
