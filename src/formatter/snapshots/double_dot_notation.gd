# --- IN ---
func handleDeath() -> void:
    var signalConnections: Array[Dictionary] = self.get_incoming_connections()
    for connection in signalConnections:
        connection.signal.disconnect(connection.callable)