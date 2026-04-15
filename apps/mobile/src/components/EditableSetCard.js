import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { timeStringToDate, formatHHMM, timeToTotalMinutes, formatDisplayTime } from '../utils';

const STAGE_OPTIONS = [
  'Coachella Stage', 'Outdoor Theatre', 'Sonora', 'Gobi',
  'Mojave', 'Sahara', 'Yuma', 'Quasar', 'Do Lab', 'Heineken House',
];

/**
 * EditableSetCard — artist card with inline edit expand, delete, and preference toggle.
 *
 * Props:
 *   setItem         — { canonical_set_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, preference }
 *   isEditing       — boolean, controlled by parent (only one card edits at a time)
 *   onStartEdit     — () => void — parent sets this card as the active editing card
 *   onCancelEdit    — () => void — parent clears the active editing card
 *   onSave          — ({ artist_name, stage_name, start_time_pt, end_time_pt }) => Promise<void>
 *   onDelete        — () => Promise<void>
 *   onSetPreference — (canonicalSetId, preference) => void
 *   saving          — boolean — show spinner on Save button
 *   deleting        — boolean — hide card while deleting (optimistic)
 */
export function EditableSetCard({
  setItem,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onSetPreference,
  saving = false,
  deleting = false,
  stageOptions,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const stages = stageOptions || STAGE_OPTIONS;
  const [editName, setEditName] = useState(setItem.artist_name);
  const [editStage, setEditStage] = useState(setItem.stage_name);
  const [editStageOpen, setEditStageOpen] = useState(false);
  const [editStageCustom, setEditStageCustom] = useState(false);
  const [editStart, setEditStart] = useState(() => timeStringToDate(setItem.start_time_pt));
  const [editEnd, setEditEnd] = useState(() => timeStringToDate(setItem.end_time_pt));
  const [activeTimePicker, setActiveTimePicker] = useState(null); // 'start' | 'end' | null
  const [saveError, setSaveError] = useState('');

  if (deleting) return null;

  const handleStartEdit = () => {
    setEditName(setItem.artist_name);
    setEditStage(setItem.stage_name);
    setEditStageOpen(false);
    setEditStageCustom(false);
    setEditStart(timeStringToDate(setItem.start_time_pt));
    setEditEnd(timeStringToDate(setItem.end_time_pt));
    setActiveTimePicker(null);
    setSaveError('');
    onStartEdit();
  };

  const handleSave = async () => {
    setSaveError('');
    if (timeToTotalMinutes(editStart) >= timeToTotalMinutes(editEnd)) {
      setSaveError('End time must be after start time.');
      return;
    }
    try {
      await onSave({
        artist_name: editName.trim(),
        stage_name: editStage.trim(),
        start_time_pt: formatHHMM(editStart),
        end_time_pt: formatHHMM(editEnd),
      });
      onCancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const timeLabel = setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt
    ? `${formatDisplayTime(timeStringToDate(setItem.start_time_pt))}–${formatDisplayTime(timeStringToDate(setItem.end_time_pt))}`
    : formatDisplayTime(timeStringToDate(setItem.start_time_pt));

  if (isEditing) {
    return (
      <View style={styles.cardEditing}>
        <View style={styles.editHeader}>
          <Text style={styles.editLabel}>Editing</Text>
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Artist name</Text>
          <TextInput value={editName} onChangeText={setEditName} style={styles.input} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Stage</Text>
          {editStageCustom ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput
                value={editStage}
                onChangeText={setEditStage}
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter stage name"
                autoFocus
              />
              <Pressable onPress={() => { setEditStageCustom(false); setEditStage(''); }} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable onPress={() => setEditStageOpen((o) => !o)} style={styles.dropdownTrigger}>
                <Text style={[styles.dropdownTriggerText, !editStage && styles.dropdownPlaceholder]}>
                  {editStage || 'Select stage…'}
                </Text>
                <Text style={styles.dropdownChevron}>{editStageOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {editStageOpen ? (
                <View style={styles.dropdownList}>
                  {stages.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => { setEditStage(s); setEditStageOpen(false); }}
                      style={[styles.dropdownOption, editStage === s && styles.dropdownOptionSelected]}
                    >
                      <Text style={[styles.dropdownOptionText, editStage === s && styles.dropdownOptionSelectedText]}>{s}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => { setEditStage(''); setEditStageCustom(true); setEditStageOpen(false); }}
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
              <Text style={styles.timePickerText}>{formatDisplayTime(editStart)}</Text>
            </Pressable>
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>End time</Text>
            <Pressable
              onPress={() => setActiveTimePicker(activeTimePicker === 'end' ? null : 'end')}
              style={[styles.timePickerBtn, activeTimePicker === 'end' && styles.timePickerBtnActive]}
            >
              <Text style={styles.timePickerText}>{formatDisplayTime(editEnd)}</Text>
            </Pressable>
          </View>
        </View>

        {activeTimePicker ? (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={activeTimePicker === 'start' ? editStart : editEnd}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minuteInterval={5}
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') {
                  setActiveTimePicker(null);
                }
                if (selectedDate) {
                  if (activeTimePicker === 'start') setEditStart(selectedDate);
                  else setEditEnd(selectedDate);
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
            <Pressable onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          )}
          <Pressable onPress={onCancelEdit} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>

        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>⚠ Edits to name, stage, or time affect everyone in your group who has this artist.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.artistName}>{setItem.artist_name}</Text>
          <Text style={styles.details}>{setItem.stage_name} · {timeLabel}</Text>
        </View>
        <Pressable onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.prefRow}>
        <Pressable
          onPress={() => onSetPreference(setItem.canonical_set_id, 'must_see')}
          style={[styles.prefBtn, setItem.preference === 'must_see' && styles.prefBtnActive]}
        >
          <Text style={[styles.prefBtnText, setItem.preference === 'must_see' && styles.prefBtnTextActive]}>Must-See</Text>
        </Pressable>
        <Pressable
          onPress={() => onSetPreference(setItem.canonical_set_id, 'flexible')}
          style={[styles.prefBtn, setItem.preference !== 'must_see' && styles.prefBtnActive]}
        >
          <Text style={[styles.prefBtnText, setItem.preference !== 'must_see' && styles.prefBtnTextActive]}>Maybe</Text>
        </Pressable>
        <Pressable onPress={handleStartEdit} style={styles.editBtn}>
          <Text style={styles.editBtnText}>Edit ✏</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: C.setRowBorder,
    borderRadius: 10,
    padding: 8,
    backgroundColor: C.setRowBg,
    gap: 6,
  },
  cardEditing: {
    borderWidth: 2,
    borderColor: C.addCardBorder,
    borderRadius: 10,
    padding: 10,
    backgroundColor: C.addCardBg,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, gap: 2 },
  artistName: { color: C.text, fontWeight: '700', fontSize: 13 },
  details: { color: C.textMuted, fontSize: 11 },
  prefRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  prefBtn: {
    borderWidth: 1,
    borderColor: C.prefBtnBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.prefBtnBg,
  },
  prefBtnActive: { backgroundColor: C.prefBtnActiveBg, borderColor: C.prefBtnActiveBorder },
  prefBtnText: { color: C.prefBtnText, fontSize: 12, fontWeight: '700' },
  prefBtnTextActive: { color: C.prefBtnActiveText },
  editBtn: {
    borderWidth: 1,
    borderColor: C.editBtnBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.editBtnBg,
    marginLeft: 'auto',
  },
  editBtnText: { color: C.editBtnText, fontSize: 11, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  deleteBtnText: { color: C.error, fontWeight: '700', fontSize: 16 },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editLabel: { color: C.addCardLabel, fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldGroup: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.fieldLabelText },
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
  dropdownOptionSelected: { backgroundColor: C.primaryBg },
  dropdownOptionText: { fontSize: 13, color: C.text },
  dropdownOptionSelectedText: { color: C.primary, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 8 },
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
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
  warningBox: {
    backgroundColor: C.warningBg,
    borderWidth: 1,
    borderColor: C.warningBorder,
    borderRadius: 8,
    padding: 8,
  },
  warningText: { fontSize: 11, color: C.warning },
});
