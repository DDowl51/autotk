#!/usr/bin/env bash
# 一卡多实例吞吐测试：并发跑 N 个独立 bench 单流实例，聚合吞吐 = 各实例吞吐之和。
# 因模型 only batch=1，这是没有批处理时提升单卡吞吐的主要手段。
#
# 用法:
#   MODEL=~/LocateAnything-3B IMAGES=$BENCH/shots bash multiinstance.sh 2 --attn sdpa --max-side 768
#   MODEL=~/LocateAnything-3B IMAGES=$BENCH/shots bash multiinstance.sh 3 --attn sdpa --max-side 768 --fp8
#
# 说明:
#   - 每个实例各自加载一份模型(BF16 ~6.8GB / FP8 ~3.4GB) → N 份显存,先用 nvidia-smi 确认塞得下。
#   - 每实例跑 10图×5次=50 次推理;并发下各自 report 的「单流吞吐」已含相互挤占,求和即聚合。
#   - 另开一个终端 `watch -n1 nvidia-smi` 看显存/利用率峰值。
set -u
N="${1:?用法: bash multiinstance.sh N [bench 参数...]}"; shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${MODEL:-./LocateAnything-3B}"
IMAGES="${IMAGES:-$HERE/shots}"

echo "并发 $N 个实例 | model=$MODEL | 额外参数: $* "
rm -f mi_*.log
pids=()
for i in $(seq 1 "$N"); do
  python "$HERE/bench.py" --model "$MODEL" --images "$IMAGES" --runs 5 --out "out_mi_$i" "$@" >"mi_$i.log" 2>&1 &
  pids+=($!)
done
echo "已启动,等全部完成(看 mi_*.log)…"
for p in "${pids[@]}"; do wait "$p"; done

echo
echo "==== 各实例单流吞吐(并发挤占下) ===="
grep -h "单流吞吐" mi_*.log || { echo "没抓到吞吐,实例可能崩了,看 mi_*.log 末尾:"; tail -n3 mi_*.log; exit 1; }
echo
grep -h "单流吞吐" mi_*.log \
  | grep -oE '[0-9]+\.[0-9]+ 张/秒' | grep -oE '[0-9]+\.[0-9]+' \
  | awk -v n="$N" '{s+=$1} END{printf "==== 聚合吞吐 ≈ %.2f 张/秒（%d 实例之和）====\n", s, n}'
echo "峰值显存请看 nvidia-smi;各实例「模型驻留显存」见 mi_*.log 开头。"
