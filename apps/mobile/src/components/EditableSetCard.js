import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';

function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (h >= 24) h -= 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${ampm}`;
}

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
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [editName, setEditName] = useState(setItem.artist_name);
  const [editStage, setEditStage] = useState(setItem.stage_name);
  const [editStart, setEditStart] = useState(setItem.start_time_pt);
  const [editEnd, setEditEnd] = useState(setItem.end_time_pt);
  const [saveError, setSaveError] = useState('');

  if (deleting) return null;

  const handleStartEdit = () => {
    // Reset form to current values each time edit opens
    setEditName(setItem.artist_name);
    setEditStage(setItem.stage_name);
    setEditStart(setItem.start_time_pt);
    setEditEnd(setItem.end_time_pt);
    setSaveError('');
    onStartEdit();
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await onSave({
        artist_name: editName.trim(),
        stage_name: editStage.trim(),
        start_time_pt: editStart.trim(),
        end_time_pt: editEnd.trim(),
      });
      onCancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const timeLabel = setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt
    ? `${formatTime(setItem.start_time_pt)}–${formatTime(setItem.end_time_pt)}`
    : formatTime(setItem.start_time_pt);

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
          <TextInput value={editStage} onChangeText={setEditStage} style={styles.input} />
        </View>
        <View style={styles.timeRow}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
            <TextInput value={editStart} onChangeText={setEditStart} style={styles.input} placeholder="e.g. 21:00" />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>End (HH:MM)</Text>
            <TextInput value={editEnd} onChangeText={setEditEnd} style={styles.input} placeholder="e.g. 23:00" />
          </View>
        </View>

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
  deleteBtnText: { color: C.error, fontWeight: '800', fontSize: 16 },
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
  saveError: { color: C.error, fontWeight: '600', fontSize: 12 },
  warningBox: {
    backgroundColor: C.warningBg,
    borderWidth: 1,
    borderColor: C.warningBorder,
    borderRadius: 8,
    padding: 8,
  },
  warningText: { fontSize: 11, color: C.warning },
});
