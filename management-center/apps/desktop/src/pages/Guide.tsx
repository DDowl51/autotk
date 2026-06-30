import { Steps, Collapse } from "antd";
import { PageHeader, SectionCard, Mono } from "../ui";
import { C } from "../theme";

const TXT = { color: "#9fb0c0", lineHeight: 2 } as const;

export function Guide() {
  return (
    <>
      <PageHeader title="使用说明" subtitle="第一次用？看这里" />

      <SectionCard title="这是什么">
        <p style={{ color: "#9fb0c0", lineHeight: 1.9, margin: 0 }}>
          autotk 控制中心：集中盯几百台手机的运行状态、看实时日志、批量改设置、用文件夹工作流自动发视频。
          手机端（autotk）和本应用都连到同一个云 Hub 通信。
        </p>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="快速上手">
        <Steps
          direction="vertical"
          current={-1}
          items={[
            {
              title: "启动 Hub",
              description: (
                <span>
                  在 <Mono>services/hub</Mono> 运行 <Mono>npm start</Mono>（默认 :4000）。
                </span>
              ),
            },
            {
              title: "填 Hub 地址",
              description: "到「设置」填入 Hub 地址并保存重连，顶部状态变「已连接」（柠檬色脉冲）。",
            },
            {
              title: "让手机连上来",
              description: "手机端 autotk 激活后会自动连 Hub、上报状态，出现在「总览 / 设备」。",
            },
            {
              title: "没真机？先用模拟手机",
              description: (
                <span>
                  在 <Mono>services/hub</Mono> 运行 <Mono>npm run mock -- d1 手机1</Mono>，看板立刻出现一台「手机1」，
                  会模拟运行状态与日志。
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="各页说明">
        <ul style={{ ...TXT, paddingLeft: 18, margin: 0 }}>
          <li><b>总览</b>：在线 / 运行 / 告警统计（数字会滚动）＋机群状态条＋在线/运行趋势图＋告警流。</li>
          <li>
            <b>设备</b>：设备列表（可搜索 / 按状态筛选 / 排序）。点一行看单机详情，含<b>实时日志面板</b>（打开时手机切到高频上报）。
            勾选多台 → <b>「批量修改设置」</b>，弹窗按手机同款分页（关键词 / 推荐页 / 搜索页 / 个人主页 / 时间）改配置，
            每组一个「下发这组」开关，<b>只发打开的组</b>，手机校验后生效。
          </li>
          <li><b>告警</b>：手机上报的卡死 / 长时间无进展等，集中在这里，可确认（ack）。</li>
          <li><b>下发记录</b>：批量下发的<b>实时进度</b>（逐台 成功/失败/离线/超时）＋<b>历史</b>；历史每条可展开看「改了哪些内容」。</li>
          <li>
            <b>发布</b>：文件夹工作流。在「设置」选好视频根目录后，每台设备对应一个<Mono>以设备名命名</Mono>的子文件夹；
            把视频放进去 → 在本页「扫描」→ 逐台/逐条发布到对应手机的 TikTok。
          </li>
          <li><b>设置</b>：Hub 地址、疑似卡住阈值、视频根文件夹、关于。</li>
        </ul>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="发布（文件夹工作流）怎么用">
        <Steps
          direction="vertical"
          current={-1}
          items={[
            {
              title: "选根目录",
              description: "「设置」→ 视频根文件夹 → 选择文件夹（桌面应用内可直接选）。",
            },
            {
              title: "按设备名建子文件夹、放视频",
              description: (
                <span style={TXT}>
                  根目录下每个子文件夹名 = 设备名；把当天要发的视频（<Mono>mp4/mov/m4v</Mono>）放进对应子文件夹。
                </span>
              ),
            },
            {
              title: "配文案（可选）",
              description: (
                <span style={TXT}>
                  优先级：<b>同名 .txt</b>（如 <Mono>v1.mp4</Mono> → <Mono>v1.txt</Mono>）＞ <b>captions.txt</b>（按行
                  <Mono> 文件名 = 文案 </Mono>）＞ 文件名本身。
                </span>
              ),
            },
            {
              title: "扫描并发布",
              description: (
                <span style={TXT}>
                  「发布」页点「扫描」→ 各设备列出待发视频与计划时间。选「传输方式」（同网用<b>局域网直传</b>、
                  跨网用<b>Hub 中转</b>）→ 单条「发布」或「全部发布」。发过的会自动去重，不重复发。
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="常见问题">
        <Collapse
          ghost
          items={[
            {
              key: "1",
              label: "看板一直「未连接」？",
              children: (
                <span style={{ color: C.dim }}>
                  确认 Hub 已启动、「设置」里的地址正确（本机默认 http://localhost:4000），防火墙未拦截。
                </span>
              ),
            },
            {
              key: "2",
              label: "设备显示离线但手机在跑？",
              children: (
                <span style={{ color: C.dim }}>手机网络或与 Hub 的连接断了；恢复网络后会自动重连并重新上报。</span>
              ),
            },
            {
              key: "3",
              label: "批量改了设置，手机什么时候生效？",
              children: (
                <span style={{ color: C.dim }}>
                  手机收到后即时校验合并；正在跑的引擎会在下一轮循环读到新值。非法值会被手机拒绝，在「下发记录」里显示失败原因。
                </span>
              ),
            },
            {
              key: "4",
              label: "发布点了没反应 / 失败？",
              children: (
                <span style={{ color: C.dim }}>
                  确认目标设备<b>在线</b>且已连 Hub；同网用「局域网直传」、跨网用「Hub 中转」；本功能需在<b>桌面应用</b>内使用
                  （浏览器预览无法访问本地文件夹）。失败原因见「发布进度」表。
                </span>
              ),
            },
            {
              key: "5",
              label: "告警是什么？",
              children: (
                <span style={{ color: C.dim }}>
                  手机端遇到弹窗卡死 / 长时间无进展等会上报告警，在总览与「告警」页高亮，便于及时处理。
                </span>
              ),
            },
          ]}
        />
      </SectionCard>
    </>
  );
}
