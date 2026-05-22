"""Fast local neuro-symbolic sidecar for Parix.

The sidecar deliberately has zero mandatory third-party dependencies. When
Synalinks, HybridAGI, or torchlogic are installed, this package is the seam
where those adapters can be swapped in. Until then it provides deterministic
fallback perception, behavior-graph, and optimizer responses over NDJSON TCP.
"""

