import { registerRootComponent } from 'expo';

import App from './App';
import { installGlobalErrorHandlers } from './src/app/globalErrors';

// 全局兜底：捕获未处理的 JS 错误 / promise 拒绝，记日志但不让 App 静默崩。
installGlobalErrorHandlers();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
