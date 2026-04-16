import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EditableSetCard } from './EditableSetCard';
import { useTheme } from '../theme';
import { formatHHMM, formatDisplayTime, timeToTotalMinutes, timeStringToDate, formatTimeStr } from '../utils';

export const STAGE_OPTIONS = [
  'Coachella Stage', 'Outdoor Theatre', 'Sonora', 'Gobi',
  'Mojave', 'Sahara', 'Yuma', 'Quasar', 'Do Lab', 'Heineken House',
];

function AddArtistForm({ dayIndex, onAdd, onCancel, C, styles, stageOptions, officialSets, festivalDays }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageCustom, setStageCustom] = useState(false);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setHours(20, 0, 0, 0); return d; });
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setHours(21, 0, 0, 0); return d; });
  const [activeTimePicker, setActiveTimePicker] = useState(null); // 'start' | 'end' | null
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const [lastPickedName, setLastPickedName] = useState('');
  // When festivalDays is provided (top-level form), manage day selection internally
  const [internalDayIndex, setInternalDayIndex] = useState(
    festivalDays ? (festivalDays[0]?.dayIndex ?? 1) : null
  );
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  const effectiveDayIndex = festivalDays ? internalDayIndex : dayIndex;
  const stages = stageOptions || STAGE_OPTIONS;

  // Autocomplete: cross-day when festivalDays provided, single-day otherwise
  const suggestions = useMemo(() => {
    if (!officialSets || !name.trim() || name.trim().length < 2 || suggestionsHidden) return [];
    const q = name.trim().toLowerCase();
    const pool = festivalDays
      ? officialSets.filter((s) => s.artist_name.toLowerCase().includes(q))
      : officialSets.filter((s) => s.day_index === dayIndex && s.artist_name.toLowerCase().includes(q));
    return pool.slice(0, 5);
  }, [officialSets, name, dayIndex, suggestionsHidden, festivalDays]);

  const handleSelectSuggestion = (s) => {
    setName(s.artist_name);
    setLastPickedName(s.artist_name);
    setStage(s.stage_name);
    setStageCustom(false);
    setStageOpen(false);
    if (festivalDays) setInternalDayIndex(s.day_index);
    if (s.start_time_pt) setStartDate(timeStringToDate(s.start_time_pt));
    if (s.end_time_pt) setEndDate(timeStringToDate(s.end_time_pt));
    setSuggestionsHidden(true);
  };

  const handleNameChange = (text) => {
    if (text !== lastPickedName) setSuggestionsHidden(false);
    setName(text);
  };

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim()) {
      setFormError('Artist name and stage are required.');
      return;
    }
    if (festivalDays && !effectiveDayIndex) {
      setFormError('Please select a day.');
      return;
    }
    if (timeToTotalMinutes(startDate) >= timeToTotalMinutes(endDate)) {
      setFormError('End time must be after start time.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: formatHHMM(startDate),
        end_time_pt: formatHHMM(endDate),
        day_index: effectiveDayIndex,
      });
      onCancel();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCard}>
      <Text style={styles.addCardLabel}>Add Artist</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Artist name</Text>
        <TextInput
          value={name}
          onChangeText={handleNameChange}
          style={styles.input}
          placeholder="e.g. Bad Bunny"
          placeholderTextColor={C.textMuted}
        />
        {suggestions.length > 0 ? (
          <View style={styles.suggestionList}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id || `${s.artist_name}-${s.start_time_pt}`}
                onPress={() => handleSelectSuggestion(s)}
                style={styles.suggestionRow}
              >
                <Text style={styles.suggestionName}>{s.artist_name}</Text>
                <Text style={styles.suggestionDetail}>
                  {s.stage_name} · {formatTimeStr(s.start_time_pt)}{s.end_time_pt ? `–${formatTimeStr(s.end_time_pt)}` : ''}
                  {festivalDays ? ` · ${festivalDays.find((d) => d.dayIndex === s.day_index)?.label || ''}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {festivalDays ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Day</Text>
          <Pressable onPress={() => setDayPickerOpen((o) => !o)} style={styles.dropdownTrigger}>
            <Text style={[styles.dropdownTriggerText, !effectiveDayIndex && styles.dropdownPlaceholder]}>
              {festivalDays.find((d) => d.dayIndex === effectiveDayIndex)?.label || 'Select day…'}
            </Text>
            <Text style={styles.dropdownChevron}>{dayPickerOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {dayPickerOpen ? (
            <View style={styles.dropdownList}>
              {festivalDays.map((d) => (
                <Pressable
                  key={d.dayIndex}
                  onPress={() => { setInternalDayIndex(d.dayIndex); setDayPickerOpen(false); }}
                  style={[styles.dropdownOption, effectiveDayIndex === d.dayIndex && styles.dropdownOptionSelected]}
                >
                  <Text style={[styles.dropdownOptionText, effectiveDayIndex === d.dayIndex && styles.dropdownOptionSelectedText]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Stage</Text>
        {stageCustom ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput
              value={stage}
              onChangeText={setStage}
              style={[styles.input, { flex: 1 }]}
              placeholder="Enter stage name"
              autoFocus
            />
            <Pressable onPress={() => { setStageCustom(false); setStage(''); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable onPress={() => setStageOpen((o) => !o)} style={styles.dropdownTrigger}>
              <Text style={[styles.dropdownTriggerText, !stage && styles.dropdownPlaceholder]}>
                {stage || 'Select stage…'}
              </Text>
              <Text style={styles.dropdownChevron}>{stageOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {stageOpen ? (
              <View style={styles.dropdownList}>
                {stages.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => { setStage(s); setStageOpen(false); }}
                    style={[styles.dropdownOption, stage === s && styles.dropdownOptionSelected]}
                  >
                    <Text style={[styles.dropdownOptionText, stage === s && styles.dropdownOptionSelectedText]}>{s}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => { setStage(''); setStageCustom(true); setStageOpen(false); }}
                  style={styles.dropdownOption}
                >
                  <Text style={[styles.dropdownOptionText, { fontStyle: 'italic' }]}>Other (type manually)…</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.timeRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Start time</Text>
          <Pressable
            onPress={() => setActiveTimePicker(activeTimePicker === 'start' ? null : 'start')}
            style={[styles.timePickerBtn, activeTimePicker === 'start' && styles.timePickerBtnActive]}
          >
            <Text style={styles.timePickerText}>{formatDisplayTime(startDate)}</Text>
          </Pressable>
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>End time</Text>
          <Pressable
            onPress={() => setActiveTimePicker(activeTimePicker === 'end' ? null : 'end')}
            style={[styles.timePickerBtn, activeTimePicker === 'end' && styles.timePickerBtnActive]}
          >
            <Text style={styles.timePickerText}>{formatDisplayTime(endDate)}</Text>
          </Pressable>
        </View>
      </View>

      {activeTimePicker ? (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={activeTimePicker === 'start' ? startDate : endDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minuteInterval={5}
            onChange={(event, selectedDate) => {
              if (Platform.OS === 'android') {
                setActiveTimePicker(null);
              }
              if (selectedDate) {
                if (activeTimePicker === 'start') setStartDate(selectedDate);
                else setEndDate(selectedDate);
              }
            }}
            style={styles.picker}
            textColor={C.text}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setActiveTimePicker(null)} style={styles.pickerDoneBtn}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.saveRow}>
        {saving ? (
          <ActivityIndicator color={C.primary} />
        ) : (
          <Pressable onPress={handleAdd} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {formError ? <Text style={styles.saveError}>{formError}</Text> : null}
    </View>
  );
}

export function DayTabReview({
  festivalDays = [],
  dayStates = {},
  onRetry,
  onDeleteSet,
  onAddSet,
  onSetPreference,
  onEditSet,
  onReUpload,
  onAddOpen,
  onConfirmDay,
  initialSelectedDay,
  storageKey,
  officialSets,
  stageOptions,
  hideAddButton = false,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [activeDay, setActiveDay] = useState(initialSelectedDay ?? festivalDays[0]?.dayIndex ?? 1);
  const [editingSetId, setEditingSetId] = useState(null);
  const [savingSetId, setSavingSetId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey).then((val) => {
      if (val !== null) setActiveDay(Number(val));
    });
  }, [storageKey]);

  const handleTabPress = (dayIndex) => {
    setActiveDay(dayIndex);
    setEditingSetId(null);
    setIsAdding(false);
    if (storageKey) AsyncStorage.setItem(storageKey, String(dayIndex));
  };

  const handleSave = async (canonicalSetId, fields) => {
    if (!onEditSet) return;
    setSavingSetId(canonicalSetId);
    try {
      await onEditSet(canonicalSetId, fields);
      setEditingSetId(null);
    } catch (err) {
      throw err; // surfaced by EditableSetCard
    } finally {
      setSavingSetId(null);
    }
  };

  const current = dayStates[activeDay] || { status: 'idle', sets: [], retryCount: 0 };
  const sets = current.sets || [];

  return (
    <View>
      <View style={styles.tabBar}>
        {festivalDays.map((day) => {
          const state = dayStates[day.dayIndex] || { status: 'idle', sets: [] };
          const isActive = day.dayIndex === activeDay;
          return (
            <Pressable
              key={day.dayIndex}
              onPress={() => handleTabPress(day.dayIndex)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabActiveText]}>
                {day.label}
              </Text>
              {state.status === 'uploading' ? (
                <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 4 }} />
              ) : state.confirmed ? (
                <Text style={styles.tabConfirmedMark}>✓</Text>
              ) : state.status === 'done' && (state.sets || []).length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{(state.sets || []).length}</Text>
                </View>
              ) : state.status === 'failed' ? (
                <Text style={styles.tabErrorMark}>!</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.content}>
        {current.status === 'uploading' ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={C.primary} />
            <View>
              <Text style={styles.loadingText}>Analyzing your schedule…</Text>
              <Text style={styles.loadingHint}>This usually takes 15–30 seconds. Please keep the app open!</Text>
            </View>
          </View>
        ) : current.status === 'failed' ? (
          <View style={styles.failedBlock}>
            <Text style={styles.failedText}>
              {current.retryCount >= 3
                ? `${current.errorMsg || 'Could not parse this screenshot.'} (No more retries — add artists manually.)`
                : (current.errorMsg || 'Could not parse this screenshot.')}
            </Text>
            {current.retryCount < 3 ? (
              <Pressable onPress={() => onRetry(activeDay)} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>
                  Retry Upload ({3 - current.retryCount} attempt{3 - current.retryCount !== 1 ? 's' : ''} left)
                </Text>
              </Pressable>
            ) : null}
            {onReUpload ? (
              <Pressable onPress={() => onReUpload(activeDay)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Choose New Image</Text>
              </Pressable>
            ) : null}
            {!hideAddButton ? (
              isAdding ? (
                <AddArtistForm
                  dayIndex={activeDay}
                  onAdd={(fields) => onAddSet(fields, activeDay)}
                  onCancel={() => setIsAdding(false)}
                  C={C}
                  styles={styles}
                  stageOptions={stageOptions}
                  officialSets={officialSets}
                />
              ) : (
                <Pressable onPress={() => { setIsAdding(true); if (onAddOpen) onAddOpen(); }} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>+ Add Manually</Text>
                </Pressable>
              )
            ) : null}
          </View>
        ) : (
          <>
            {current.status === 'idle' ? (
              <Text style={styles.emptyText}>No screenshot uploaded for this day.</Text>
            ) : sets.length === 0 ? (
              <Text style={styles.emptyText}>No artists found — add manually below.</Text>
            ) : null}
            {sets.map((setItem) => (
              <EditableSetCard
                key={setItem.canonical_set_id}
                setItem={setItem}
                isEditing={editingSetId === setItem.canonical_set_id}
                onStartEdit={() => setEditingSetId(setItem.canonical_set_id)}
                onCancelEdit={() => setEditingSetId(null)}
                onSave={(fields) => handleSave(setItem.canonical_set_id, fields)}
                onDelete={() => onDeleteSet(setItem.canonical_set_id, activeDay)}
                onSetPreference={(canonicalSetId, pref) => onSetPreference(canonicalSetId, pref, activeDay)}
                saving={savingSetId === setItem.canonical_set_id}
                deleting={false}
                stageOptions={stageOptions}
              />
            ))}
            {!hideAddButton ? (
              isAdding ? (
                <AddArtistForm
                  dayIndex={activeDay}
                  onAdd={(fields) => onAddSet(fields, activeDay)}
                  onCancel={() => setIsAdding(false)}
                  C={C}
                  styles={styles}
                  stageOptions={stageOptions}
                  officialSets={officialSets}
                />
              ) : (
                <Pressable onPress={() => { setIsAdding(true); if (onAddOpen) onAddOpen(); }} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>+ Add Artist</Text>
                </Pressable>
              )
            ) : null}
            {onReUpload ? (
              <Pressable onPress={() => onReUpload(activeDay)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Upload Screenshot</Text>
              </Pressable>
            ) : null}
            {onConfirmDay ? (
              current.confirmed ? (
                <View style={styles.confirmedRow}>
                  <Text style={styles.confirmedText}>✓ Confirmed</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => onConfirmDay(activeDay)}
                  style={styles.confirmBtn}
                >
                  <Text style={styles.confirmBtnText}>
                    Confirm {festivalDays.find((d) => d.dayIndex === activeDay)?.label || 'Day'}'s selections →
                  </Text>
                </Pressable>
              )
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

/** Self-contained Add Artist form for use outside DayTabReview (e.g. top-level in EditMyScheduleScreen).
 *  Handles its own theme and styles so callers don't need to import makeStyles. */
export function AddArtistFormCard({ dayIndex, festivalDays, onAdd, onCancel, officialSets, stageOptions }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <AddArtistForm
      dayIndex={dayIndex}
      festivalDays={festivalDays}
      onAdd={onAdd}
      onCancel={onCancel}
      C={C}
      styles={styles}
      officialSets={officialSets}
      stageOptions={stageOptions}
    />
  );
}

const makeStyles = (C) => StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.inputBorder,
    padding: 3,
    gap: 2,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: C.primaryBg,
    borderColor: C.primary,
  },
  tabText: { color: C.textMuted, fontWeight: '700', fontSize: 12 },
  tabActiveText: { color: C.text, fontWeight: '700' },
  badge: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: { color: C.primaryText, fontSize: 10, fontWeight: '700' },
  tabErrorMark: { color: C.error, fontWeight: '700', fontSize: 13 },
  tabConfirmedMark: { color: C.success || '#22c55e', fontWeight: '700', fontSize: 13 },
  content: { gap: 8 },
  loadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  loadingText: { color: C.textMuted, fontSize: 13 },
  loadingHint: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  failedBlock: { gap: 10 },
  failedText: { color: C.error, fontSize: 13 },
  emptyText: { color: C.textMuted, fontSize: 13 },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: C.btnSecondaryBg,
  },
  secondaryBtnText: { color: C.btnSecondaryText, fontWeight: '700', fontSize: 13 },
  addCard: {
    backgroundColor: C.addCardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.addCardBorder,
    padding: 12,
    gap: 8,
  },
  addCardLabel: { fontWeight: '700', color: C.addCardLabel, fontSize: 13 },
  fieldGroup: { gap: 3 },
  fieldLabel: { color: C.fieldLabelText, fontSize: 11, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 13,
    backgroundColor: C.inputBg,
    color: C.text,
  },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  saveError: { color: C.error, fontWeight: '700', fontSize: 12 },
  suggestionList: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    backgroundColor: C.cardBg,
    overflow: 'hidden',
    marginTop: 2,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    gap: 2,
  },
  suggestionName: { fontSize: 13, fontWeight: '700', color: C.text },
  suggestionDetail: { fontSize: 11, color: C.textMuted },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 9,
    backgroundColor: C.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownTriggerText: { fontSize: 13, color: C.text },
  dropdownPlaceholder: { color: C.textMuted },
  dropdownChevron: { fontSize: 10, color: C.textMuted },
  dropdownList: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    backgroundColor: C.cardBg,
    overflow: 'hidden',
    marginTop: 2,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  dropdownOptionSelected: {
    backgroundColor: C.primaryBg,
  },
  dropdownOptionText: { fontSize: 13, color: C.text },
  dropdownOptionSelectedText: { color: C.primary, fontWeight: '700' },
  timePickerBtn: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 10,
    backgroundColor: C.inputBg,
    alignItems: 'center',
  },
  timePickerBtnActive: {
    borderColor: C.primary,
    backgroundColor: C.primaryBg,
  },
  timePickerText: { fontSize: 14, fontWeight: '700', color: C.text },
  pickerContainer: {
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.inputBorder,
    overflow: 'hidden',
  },
  picker: { width: '100%' },
  pickerDoneBtn: {
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.inputBorder,
  },
  pickerDoneText: { color: C.primary, fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmBtnText: {
    color: C.primaryText,
    fontWeight: '700',
    fontSize: 14,
  },
  confirmedRow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  confirmedText: {
    color: C.success || C.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});
