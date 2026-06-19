import { useEffect, useRef, useState } from "react";
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "./fields";

const ITEM_HEIGHT = 44;
const VISIBLE = 5;
const PICKER_H = ITEM_HEIGHT * VISIBLE;
const PAD = (PICKER_H - ITEM_HEIGHT) / 2;

const pad2 = (n: number) => String(n).padStart(2, "0");

function parse(value: string): { h: number; m: number; s: number } {
  const [h, m, s] = value.split(":").map((x) => parseInt(x, 10) || 0);
  return { h: h ?? 0, m: m ?? 0, s: s ?? 0 };
}

/** 单列可滑动滚轮。 */
function Wheel({
  data,
  index,
  onChange,
}: {
  data: string[];
  index: number;
  onChange: (i: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const didInit = useRef(false);

  // 只读取落点对应的索引；对齐交给 snapToInterval 自动完成。
  // 切勿在这里调 scrollTo(animated)，否则会与滚动事件形成死循环导致卡死。
  const handleEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(data.length - 1, Math.max(0, i));
    if (clamped !== index) onChange(clamped);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={handleEnd}
      onScrollEndDrag={handleEnd}
      onLayout={() => {
        if (!didInit.current) {
          didInit.current = true;
          ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
        }
      }}
      contentContainerStyle={{ paddingVertical: PAD }}
    >
      {data.map((d, i) => (
        <View key={i} style={styles.item}>
          <Text style={[styles.itemText, i === index && styles.itemActive]}>
            {d}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** 一列：滚轮 + 下方单位标签。 */
function Column({
  data,
  index,
  onChange,
  unit,
}: {
  data: string[];
  index: number;
  onChange: (i: number) => void;
  unit: string;
}) {
  return (
    <View style={styles.column}>
      <Wheel data={data} index={index} onChange={onChange} />
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const SIXTY = Array.from({ length: 60 }, (_, i) => pad2(i));

/** 滑动设置时间的弹窗，返回 "HH:MM:SS"。 */
export function TimePickerModal({
  visible,
  value,
  title,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  title: string;
  onCancel: () => void;
  onConfirm: (v: string) => void;
}) {
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const [s, setS] = useState(0);
  // 每次打开 +1，用作滚轮的 key，强制重新挂载以滚动到当前值。
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (visible) {
      const p = parse(value);
      setH(p.h);
      setM(p.m);
      setS(p.s);
      setSession((x) => x + 1);
    }
  }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancel}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={() => onConfirm(`${pad2(h)}:${pad2(m)}:${pad2(s)}`)}>
              <Text style={styles.confirm}>确定</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.wheels}>
            {/* 居中选择带 */}
            <View pointerEvents="none" style={styles.band} />
            <Column key={`h${session}`} data={HOURS} index={h} onChange={setH} unit="时" />
            <Text style={styles.colon}>:</Text>
            <Column key={`m${session}`} data={SIXTY} index={m} onChange={setM} unit="分" />
            <Text style={styles.colon}>:</Text>
            <Column key={`s${session}`} data={SIXTY} index={s} onChange={setS} unit="秒" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 28,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  cancel: { color: COLORS.sub, fontSize: 15 },
  confirm: { color: COLORS.accent, fontSize: 15, fontWeight: "700" },
  wheels: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginTop: 8,
  },
  band: {
    position: "absolute",
    left: 24,
    right: 24,
    top: PAD,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
  },
  column: { alignItems: "center" },
  wheel: { width: 64, height: PICKER_H },
  item: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  itemText: { color: COLORS.faint, fontSize: 20 },
  itemActive: { color: COLORS.text, fontWeight: "700", fontSize: 22 },
  colon: {
    color: COLORS.sub,
    fontSize: 20,
    height: PICKER_H,
    lineHeight: PICKER_H,
    marginHorizontal: 2,
  },
  unit: { color: COLORS.faint, fontSize: 12, marginTop: 4 },
});
