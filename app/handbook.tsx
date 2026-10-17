/** Handbook: read the Student / Parent Handbook and search it. Works signed out. */
import { useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HANDBOOK_SOURCE, PAGES, pattern, search, type Page } from '../src/handbook/handbook';
import { C, Card, P, s } from '../src/ui';

const BLUE = '#0369A1';
const MARK = '#FDE68A';

/** Text with every match of the search highlighted. */
function Marked({ text, re, style }: { text: string; re: RegExp | null; style: object }) {
  if (!re) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${re.source})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((part, i) => (i % 2 ? <Text key={i} style={{ backgroundColor: MARK }}>{part}</Text> : part))}
    </Text>
  );
}

export default function Handbook() {
  const [query, setQuery] = useState('');
  const [mark, setMark] = useState('');       // what's highlighted in the reader after choosing a result
  const [browsing, setBrowsing] = useState(false);
  const list = useRef<FlatList<Page>>(null);

  const matches = useMemo(() => search(PAGES, query), [query]);
  const pagesHit = useMemo(() => new Set(matches.map((m) => m.page)).size, [matches]);
  const markRe = useMemo(() => pattern(mark), [mark]);
  const searching = !!pattern(query) && !browsing;

  const open = (page: number) => {
    setMark(query);
    setBrowsing(true);
    const index = PAGES.findIndex((p) => p.page === page);
    setTimeout(() => list.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }), 50);
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Handbook' }} />
      <View style={{ padding: 12, gap: 8, borderBottomWidth: 1, borderColor: C.line, backgroundColor: C.card }}>
        <View style={[s.row, s.input, { paddingVertical: 8 }]}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput style={{ flex: 1, fontSize: 15, color: C.ink }} placeholder="Search the handbook" value={query}
            onChangeText={(t) => { setQuery(t); setBrowsing(false); if (!t) setMark(''); }}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="never" accessibilityLabel="Search the handbook" />
          {!!query && (
            <Pressable onPress={() => { setQuery(''); setMark(''); setBrowsing(false); }} accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </Pressable>
          )}
        </View>
        {!!pattern(query) && (
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: C.muted }}>
              {matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'} on ${pagesHit} page${pagesHit === 1 ? '' : 's'}` : 'No matches'}
            </Text>
            {browsing && matches.length > 0 && (
              <Text style={{ color: BLUE, fontWeight: '700' }} onPress={() => setBrowsing(false)}>Back to results</Text>
            )}
          </View>
        )}
      </View>

      {searching ? (
        <FlatList data={matches} keyExtractor={(m, i) => `${m.page}-${i}`} contentContainerStyle={s.pad}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Card><P muted>Nothing in the handbook matches "{query.trim()}". Try a shorter word, or ask the Assistant.</P></Card>}
          renderItem={({ item: m }) => (
            <Card onPress={() => open(m.page)}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: BLUE }}>PAGE {m.page}</Text>
              <Text style={{ fontSize: 15, lineHeight: 21, color: C.ink }}>
                {m.before}<Text style={{ backgroundColor: MARK, fontWeight: '700' }}>{m.hit}</Text>{m.after}
              </Text>
            </Card>
          )} />
      ) : (
        <FlatList ref={list} data={PAGES} keyExtractor={(p) => String(p.page)} contentContainerStyle={s.pad}
          initialNumToRender={6}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            setTimeout(() => list.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }), 150);
          }}
          ListHeaderComponent={
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="book" size={28} color={BLUE} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>Student / Parent Handbook</Text>
                <Text style={{ color: BLUE, fontWeight: '600' }} onPress={() => Linking.openURL(HANDBOOK_SOURCE)}>Open the original PDF ↗</Text>
              </View>
            </Card>}
          renderItem={({ item: p }) => (
            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted }}>PAGE {p.page} OF {PAGES.length}</Text>
              {p.blocks.map((b, i) => (
                <Marked key={i} text={b.text} re={markRe}
                  style={b.kind === 'heading'
                    ? { fontSize: 16, fontWeight: '800', color: C.primary, marginTop: i ? 6 : 0 }
                    : { fontSize: 15, lineHeight: 22, color: C.ink }} />
              ))}
            </Card>
          )} />
      )}
    </View>
  );
}
