/**
 * Per-app routing: the user's own SOCKS5/HTTP proxies and a route per
 * application.
 */
export {
  CheckCustomProxies,
  DeleteAppRoute,
  DeleteCustomProxy,
  GetAppRouting,
  ListRunningApps,
  PickAppExecutable,
  SaveAppRoute,
  SaveCustomProxy,
} from '../../wailsjs/go/main/App'
