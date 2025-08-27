// o2log/main.js
import React from 'https://esm.sh/react@18.2.0?dev';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client?dev';
// ВАЖНО: у Recharts добавляем ?bundle, чтобы подтянулись все d3-зависимости.
import * as Recharts from 'https://esm.sh/recharts@2.10.4?bundle&target=es2018&dev';

import O2LogApp from './O2LogApp.js';

const el = document.getElementById('root');
createRoot(el).render(React.createElement(O2LogApp, { React, Recharts }));
