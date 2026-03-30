import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
            <ActivityIndicator color="#183a27" />
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

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e4d6c3',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fffdfa',
    gap: 6,
  },
  cardEditing: {
    borderWidth: 2,
    borderColor: '#6a9e73',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fffdf8',
    gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, gap: 2 },
  artistName: { color: '#2f2f2f', fontWeight: '700', fontSize: 13 },
  details: { color: '#888', fontSize: 11 },
  prefRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  prefBtn: {
    borderWidth: 1,
    borderColor: '#cab697',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbf6ee',
  },
  prefBtnActive: { backgroundColor: '#e4f2e7', borderColor: '#6a9e73' },
  prefBtnText: { color: '#4a4a4a', fontSize: 12, fontWeight: '700' },
  prefBtnTextActive: { color: '#235232' },
  editBtn: {
    borderWidth: 1,
    borderColor: '#b0c8bc',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f0f7f3',
    marginLeft: 'auto',
  },
  editBtnText: { color: '#345a46', fontSize: 11, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  deleteBtnText: { color: '#b52424', fontWeight: '800', fontSize: 16 },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editLabel: { color: '#2d6a4a', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldGroup: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#5a4d3b' },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 13,
    backgroundColor: '#fff',
  },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#183a27',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#666', fontWeight: '700', fontSize: 13 },
  saveError: { color: '#b52424', fontWeight: '600', fontSize: 12 },
  warningBox: {
    backgroundColor: '#fff8f0',
    borderWidth: 1,
    borderColor: '#e8c89a',
    borderRadius: 8,
    padding: 8,
  },
  warningText: { fontSize: 11, color: '#7a5a2a' },
});
