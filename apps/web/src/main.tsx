/* @refresh reload */
import { render } from 'solid-js/web';
import './styles/index.css';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root not found in index.html');
}

render(() => <App />, root);
