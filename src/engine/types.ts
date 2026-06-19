import type { AutomationParams } from "../params/types";

/** 一次运行过程中累计的互动数据，用于「每日任务记录」展示。 */
export interface RunStats {
  videosWatched: number;
  likes: number;
  saves: number;
  follows: number;
  commentLikes: number;
  commentReplies: number;
}

export function emptyStats(): RunStats {
  return {
    videosWatched: 0,
    likes: 0,
    saves: 0,
    follows: 0,
    commentLikes: 0,
    commentReplies: 0,
  };
}

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  log(level: LogLevel, msg: string): void;
}

/**
 * 引擎运行上下文。模块通过它读取参数、累计统计、输出日志、检查是否被请求停止。
 */
export interface RunContext {
  params: AutomationParams;
  stats: RunStats;
  logger: Logger;
  /** 返回 true 表示用户/调度请求停止，模块应尽快安全退出。 */
  shouldStop(): boolean;
  /** 可被打断的休眠（秒）。一旦请求停止会立即返回，保证停止响应及时。 */
  sleep(seconds: number): Promise<void>;
}

/** 生成单条评论回复的内容（接 Claude/GPT API），暂以接口形式占位。 */
export interface CommentGenerator {
  reply(input: {
    videoCaption: string;
    targetComment: string;
    language: string;
  }): Promise<string>;
}
