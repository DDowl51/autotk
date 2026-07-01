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
          本软件是「控制中心」：集中盯几百台手机的运行状态、看实时日志、批量改设置、用文件夹工作流自动发视频。
          <b>打开本软件就自动开启了控制中心，无需任何配置</b>；手机连到本电脑（同一个 WiFi）即可。
        </p>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="快速上手">
        <Steps
          direction="vertical"
          current={-1}
          items={[
            {
              title: "打开本软件",
              description: "控制中心已随软件自动开启，不用启动任何东西、也不用填地址。",
            },
            {
              title: "让手机连上来",
              description:
                "手机装好 App，在 App 里点「连接控制中心」，扫本软件「设置」页显示的二维码即可；手机和本电脑在同一个 WiFi 下，也会自动连上。",
            },
            {
              title: "设备自动出现",
              description: "手机激活并连上后，会自动出现在「总览 / 设备」，开始上报运行状态和日志。",
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
          <li><b>设置</b>：连接手机的二维码、疑似卡住阈值、视频根文件夹、关于。</li>
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
              description: "「设置」→ 视频根文件夹 → 选择文件夹（桌面软件内可直接选）。",
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
                  「发布」页点「扫描」→ 各设备列出待发视频与计划时间 → 选「立即发送」或「定时发送」→
                  单条「发布」或「全部发布」。视频经局域网直传到手机，发过的会自动去重、不重复发。
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
              label: "手机连不上控制中心？",
              children: (
                <span style={{ color: C.dim }}>
                  确认手机和本电脑连的是<b>同一个 WiFi</b>；用手机 App 扫「设置」页的二维码；电脑防火墙别拦本软件。
                  控制中心随本软件自动运行，无需单独启动。
                </span>
              ),
            },
            {
              key: "2",
              label: "设备显示离线但手机在跑？",
              children: (
                <span style={{ color: C.dim }}>手机网络或与控制中心的连接断了；恢复网络后会自动重连并重新上报。</span>
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
                  确认目标设备<b>在线</b>且已连上控制中心；本功能需在<b>桌面软件</b>内使用（浏览器预览无法访问本地文件夹）。
                  失败原因见「发布进度」表，把鼠标移到状态标签上有说明。
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
