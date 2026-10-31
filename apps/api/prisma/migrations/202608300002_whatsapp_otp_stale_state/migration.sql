ALTER TABLE whatsapp_otp_channels
  DROP CONSTRAINT whatsapp_otp_channels_state_check;

ALTER TABLE whatsapp_otp_channels
  ADD CONSTRAINT whatsapp_otp_channels_state_check
  CHECK (state IN (
    'DISABLED',
    'STARTING',
    'QR_REQUIRED',
    'CONNECTED',
    'DISCONNECTED',
    'FAULTED',
    'STALE'
  ));
