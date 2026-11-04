/**
 * Monaco from our own bundle instead of the CDN @monaco-editor/react uses by
 * default: Vim mode (monaco-vim) needs the same Monaco instance, and the editor
 * then loads without a third-party host (V2 features 4 and 7). Monaco 0.56
 * wires its own language workers, so no MonacoEnvironment is set here.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

loader.config({ monaco });
