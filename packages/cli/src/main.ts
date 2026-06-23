#!/usr/bin/env bun
/** MusicPlayer CLI — ink TUI 音乐播放器入口 */

import { render } from 'ink';
import React from 'react';
import App from './app.js';

render(React.createElement(App));
