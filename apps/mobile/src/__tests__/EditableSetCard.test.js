import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EditableSetCard } from '../components/EditableSetCard';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

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
    setItem: SET_ITEM,
    isEditing: false,
    onStartEdit: jest.fn(),
    onCancelEdit: jest.fn(),
    onSave: jest.fn().mockResolvedValue(undefined),
    onDelete: jest.fn(),
    onSetPreference: jest.fn(),
    saving: false,
    deleting: false,
    ...overrides,
  };
}

describe('EditableSetCard — view mode', () => {
  it('displays artist name and stage', () => {
    const { getByText } = render(<EditableSetCard {...makeProps()} />);
    expect(getByText('Bad Bunny')).toBeTruthy();
    expect(getByText(/Sahara/)).toBeTruthy();
  });

  it('renders nothing when deleting=true', () => {
    const { toJSON } = render(<EditableSetCard {...makeProps({ deleting: true })} />);
    expect(toJSON()).toBeNull();
  });

  it('calls onSetPreference with "must_see" when Must-See is pressed', () => {
    const onSetPreference = jest.fn();
    const { getByText } = render(<EditableSetCard {...makeProps({ onSetPreference })} />);
    fireEvent.press(getByText('Must-See'));
    expect(onSetPreference).toHaveBeenCalledWith('set-1', 'must_see');
  });

  it('calls onSetPreference with "flexible" when Maybe is pressed', () => {
    const onSetPreference = jest.fn();
    const { getByText } = render(<EditableSetCard {...makeProps({ onSetPreference })} />);
    fireEvent.press(getByText('Maybe'));
    expect(onSetPreference).toHaveBeenCalledWith('set-1', 'flexible');
  });

  it('calls onStartEdit when Edit button is pressed', () => {
    const onStartEdit = jest.fn();
    const { getByText } = render(<EditableSetCard {...makeProps({ onStartEdit })} />);
    fireEvent.press(getByText(/Edit/));
    expect(onStartEdit).toHaveBeenCalled();
  });
});

describe('EditableSetCard — edit mode', () => {
  it('shows form fields with current values pre-filled', () => {
    const { getByDisplayValue, getByText } = render(
      <EditableSetCard {...makeProps({ isEditing: true })} />
    );
    expect(getByDisplayValue('Bad Bunny')).toBeTruthy();
    // Stage is now a dropdown; selected value shown as text in the trigger
    expect(getByText('Sahara')).toBeTruthy();
  });

  it('calls onSave with trimmed fields when save succeeds', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByDisplayValue, getByText } = render(
      <EditableSetCard {...makeProps({ isEditing: true, onSave })} />
    );
    fireEvent.changeText(getByDisplayValue('Bad Bunny'), '  Bad Bunny  ');
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ artist_name: 'Bad Bunny' })
    );
  });

  it('shows error and does not call onSave when end time <= start time', async () => {
    const onSave = jest.fn();
    // timeStringToDate('22:00') → Date{hours:22}, timeStringToDate('21:00') → Date{hours:21}
    // timeToTotalMinutes(Date{hours:22}) = 1320 >= timeToTotalMinutes(Date{hours:21}) = 1260 → validation fires
    const { getByText } = render(
      <EditableSetCard
        {...makeProps({
          isEditing: true,
          onSave,
          setItem: { ...SET_ITEM, start_time_pt: '22:00', end_time_pt: '21:00' },
        })}
      />
    );
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText('End time must be after start time.')).toBeTruthy();
  });

  it('calls onCancelEdit when Cancel is pressed', () => {
    const onCancelEdit = jest.fn();
    const { getByText } = render(
      <EditableSetCard {...makeProps({ isEditing: true, onCancelEdit })} />
    );
    fireEvent.press(getByText('Cancel'));
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it('hides Save button while saving=true', () => {
    const { queryByText } = render(<EditableSetCard {...makeProps({ isEditing: true, saving: true })} />);
    expect(queryByText('Save')).toBeNull();
  });

  it('opens stage dropdown and allows selecting a different stage', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByText, queryByText } = render(
      <EditableSetCard {...makeProps({ isEditing: true, onSave })} />
    );
    // Dropdown initially closed — options not visible
    expect(queryByText('Gobi')).toBeNull();

    // Open the dropdown
    fireEvent.press(getByText('Sahara'));
    expect(getByText('Gobi')).toBeTruthy();

    // Pick a different stage
    fireEvent.press(getByText('Gobi'));

    // Dropdown closes, trigger shows new selection
    expect(queryByText('Gobi')).toBeTruthy();

    // Save should include the updated stage
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ stage_name: 'Gobi' })
    );
  });
});
