import { createContext, useContext } from 'react';
import { legacyMessage } from './messages.js';
export { legacyMessage } from './messages.js';
export const LanguageContext = createContext('es');
export function useUiText() {
  const language = useContext(LanguageContext);
  return (source, variables) => legacyMessage(source, language, variables);
}
