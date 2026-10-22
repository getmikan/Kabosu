package main

// slothIPCStartParams is the JSON body shape for POST /clash/start on the Kabosu Windows IPC service.
type slothIPCStartParams struct {
	CorePath     string
	ConfigPath   string
	ConfigDir    string
	CoreIpcPath  string
	LogDirectory string
}
