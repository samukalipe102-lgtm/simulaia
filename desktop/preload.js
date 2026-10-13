// Preload mínimo. O app roda a UI web servida pelo backend local; não exige
// APIs nativas no renderer. Mantido por boas práticas (contextIsolation ligado).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('simulaDesktop', {
  isDesktop: true,
  version: '1.3.0',
});
