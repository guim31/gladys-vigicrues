// -----------------------------------------------------------------------------
// The SDK's fake Gladys checks feature units against the SDK constants, read
// once when it loads. The SDK 0.16.0 does not know the m³/s unit of Gladys
// 5.3.2 yet (integration-sdk-js#47), while the real SDK client sends any unit:
// add it here, imported before the fake. A no-op once the SDK has it.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';

DEVICE_FEATURE_UNITS.CUBIC_METER_PER_SECOND ??= 'cubic-meter-per-second';
