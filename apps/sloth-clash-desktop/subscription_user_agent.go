package main

// The panel identifies Kabosu by this exact User-Agent. Core and app versions
// remain available through their dedicated metadata, without impersonating
// another client during subscription probes.
func subscriptionUserAgentCurrent() string { return "kabosu://" }

func subscriptionProbeUserAgents() []string { return []string{subscriptionUserAgentCurrent()} }
