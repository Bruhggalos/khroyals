/**
 * Date and time fields people pick instead of typing: a calendar for dates, a
 * time wheel for times (Android's dialogs, iPhone's calendar and wheel in a
 * sheet, the browser's own pickers on the web). Values are always well formed:
 * dates are "YYYY-MM-DD", times are 24-hour "HH:MM", and "" means not set.
 */
import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C, s } from '../ui';
import { dateLabel, parseDate, parseTime, timeLabel, toDateString, toTimeString } from './dates';

export * from './dates';

type Mode = 'date' | 'time';

type Props = {
  label: string;
  /** "YYYY-MM-DD" for dates, "HH:MM" for times, "" when not set. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  /** Show "Clear" so the field can be left empty. */
  optional?: boolean;
  /** Dates only: limits of the calendar ("YYYY-MM-DD"). */
  min?: string;
  max?: string;
  /** Where the calendar or wheel opens when the field is empty. */
  initial?: string;
  style?: ViewStyle;
};

function PickerField({ mode, label, value, onChange, placeholder, hint, error, optional, min, max, initial, style }: Props & { mode: Mode }) {
  const [sheet, setSheet] = useState<Date | null>(null);   // iPhone: the value being picked
  const parse = mode === 'date' ? parseDate : parseTime;
  const format = mode === 'date' ? toDateString : toTimeString;
  const shown = mode === 'date' ? dateLabel(value) : timeLabel(value);
  const start = parse(value) ?? (initial ? parse(initial) : null) ?? (() => {
    const d = new Date();
    if (mode === 'time') d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return d;
  })();
  const minimumDate = min ? parseDate(min) ?? undefined : undefined;
  const maximumDate = max ? parseDate(max) ?? undefined : undefined;
  const { flex, minWidth, width } = StyleSheet.flatten(style) ?? {};

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start, mode, is24Hour: false, minimumDate, maximumDate,
        onValueChange: (_e, d) => d && onChange(format(d)),
      });
    } else {
      setSheet(start);
    }
  };

  const box = (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${shown || 'not set'}`}
      style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        error ? { borderColor: C.danger } : null]}>
      <Text style={{ fontSize: 15, color: shown ? C.ink : '#8A93A6', flexShrink: 1 }} numberOfLines={1}>
        {shown || placeholder || (mode === 'date' ? 'Choose a date' : 'Choose a time')}
      </Text>
      <Text style={{ fontSize: 16 }}>{mode === 'date' ? '📅' : '🕒'}</Text>
    </Pressable>
  );

  // The web uses the browser's own date and time pickers.
  const web = Platform.OS === 'web' && createElement('input', {
    type: mode, value, min: mode === 'date' ? min : undefined, max: mode === 'date' ? max : undefined,
    'aria-label': label, step: mode === 'time' ? 300 : undefined,
    onChange: (e: any) => onChange(e.target.value ?? ''),
    style: {
      fontSize: 15, padding: 12, borderRadius: 10, border: `1px solid ${error ? C.danger : C.line}`, background: '#fff',
      color: C.ink, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', minHeight: 46,
    },
  });

  return (
    <View style={{ gap: 4, flex, minWidth, width }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{label}</Text>
        {optional && !!value && (
          <Text onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}
            style={{ fontSize: 13, color: C.primary, fontWeight: '600' }}>Clear</Text>
        )}
      </View>
      {web || box}
      {error ? <Text style={{ fontSize: 12, color: C.danger }}>{error}</Text>
        : hint ? <Text style={{ fontSize: 12, color: C.muted }}>{hint}</Text> : null}

      {Platform.OS === 'ios' && (
        <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setSheet(null)} accessibilityLabel="Close" />
          <View style={[s.sheet, { backgroundColor: '#fff', paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
            <View style={[s.row, { justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.line }]}>
              <Text style={{ color: C.muted, fontSize: 16 }} onPress={() => setSheet(null)}>Cancel</Text>
              <Text style={{ color: C.ink, fontWeight: '700', fontSize: 16 }}>{label}</Text>
              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 16 }}
                onPress={() => { if (sheet) onChange(format(sheet)); setSheet(null); }}>Done</Text>
            </View>
            {sheet && (
              <DateTimePicker value={sheet} mode={mode} display={mode === 'date' ? 'inline' : 'spinner'} minuteInterval={5}
                minimumDate={minimumDate} maximumDate={maximumDate} themeVariant="light" accentColor={C.primary}
                onValueChange={(_e, d) => d && setSheet(d)} style={{ alignSelf: 'center' }} />
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

/** Pick a date from a calendar. Value: "YYYY-MM-DD" or "". */
export const DateField = (p: Props) => <PickerField mode="date" {...p} />;
/** Pick a time from a wheel. Value: 24-hour "HH:MM" or "". */
export const TimeField = (p: Props) => <PickerField mode="time" {...p} />;
