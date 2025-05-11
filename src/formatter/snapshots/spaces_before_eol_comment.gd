# --- IN ---
pass # Comment 1.
pass ## Comment 2.

# --- IN ---
pass    # Comment 3.
pass    ## Comment 4.
# --- OUT ---
pass # Comment 3.
pass ## Comment 4.


# --- CONFIG ALL ---
{"spacesBeforeEndOfLineComment": 1}

# --- IN ---
pass # Comment 5.
pass ## Comment 6.

# --- IN ---
pass    # Comment 7.
pass    ## Comment 8.
# --- OUT ---
pass # Comment 7.
pass ## Comment 8.


# --- CONFIG ALL ---
{"spacesBeforeEndOfLineComment": 2}

# --- IN ---
pass # Comment 9.
pass ## Comment A.
# --- OUT ---
pass  # Comment 9.
pass  ## Comment A.

# --- IN ---
pass  # Comment B.
pass  ## Comment C.

# --- IN ---
pass    # Comment D.
pass    ## Comment E.
# --- OUT ---
pass  # Comment D.
pass  ## Comment E.
