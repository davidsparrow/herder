"use strict";(()=>{var e={};e.id=998,e.ids=[998],e.modules={2934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},3055:(e,t,n)=>{n.r(t),n.d(t,{originalPathname:()=>eu,patchFetch:()=>eh,requestAsyncStorage:()=>el,routeModule:()=>er,serverHooks:()=>ed,staticGenerationAsyncStorage:()=>ec});var s,o,i,a,r,l,c,d,u,h,f,p={};n.r(p),n.d(p,{POST:()=>ea,maxDuration:()=>ei,runtime:()=>eo});var m=n(9303),g=n(8716),E=n(670),C=n(7070),y=n(5655);(function(e){e.STRING="STRING",e.NUMBER="NUMBER",e.INTEGER="INTEGER",e.BOOLEAN="BOOLEAN",e.ARRAY="ARRAY",e.OBJECT="OBJECT"})(s||(s={})),function(e){e.LANGUAGE_UNSPECIFIED="language_unspecified",e.PYTHON="python"}(o||(o={})),function(e){e.OUTCOME_UNSPECIFIED="outcome_unspecified",e.OUTCOME_OK="outcome_ok",e.OUTCOME_FAILED="outcome_failed",e.OUTCOME_DEADLINE_EXCEEDED="outcome_deadline_exceeded"}(i||(i={}));/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let _=["user","model","function","system"];(function(e){e.HARM_CATEGORY_UNSPECIFIED="HARM_CATEGORY_UNSPECIFIED",e.HARM_CATEGORY_HATE_SPEECH="HARM_CATEGORY_HATE_SPEECH",e.HARM_CATEGORY_SEXUALLY_EXPLICIT="HARM_CATEGORY_SEXUALLY_EXPLICIT",e.HARM_CATEGORY_HARASSMENT="HARM_CATEGORY_HARASSMENT",e.HARM_CATEGORY_DANGEROUS_CONTENT="HARM_CATEGORY_DANGEROUS_CONTENT"})(a||(a={})),function(e){e.HARM_BLOCK_THRESHOLD_UNSPECIFIED="HARM_BLOCK_THRESHOLD_UNSPECIFIED",e.BLOCK_LOW_AND_ABOVE="BLOCK_LOW_AND_ABOVE",e.BLOCK_MEDIUM_AND_ABOVE="BLOCK_MEDIUM_AND_ABOVE",e.BLOCK_ONLY_HIGH="BLOCK_ONLY_HIGH",e.BLOCK_NONE="BLOCK_NONE"}(r||(r={})),function(e){e.HARM_PROBABILITY_UNSPECIFIED="HARM_PROBABILITY_UNSPECIFIED",e.NEGLIGIBLE="NEGLIGIBLE",e.LOW="LOW",e.MEDIUM="MEDIUM",e.HIGH="HIGH"}(l||(l={})),function(e){e.BLOCKED_REASON_UNSPECIFIED="BLOCKED_REASON_UNSPECIFIED",e.SAFETY="SAFETY",e.OTHER="OTHER"}(c||(c={})),function(e){e.FINISH_REASON_UNSPECIFIED="FINISH_REASON_UNSPECIFIED",e.STOP="STOP",e.MAX_TOKENS="MAX_TOKENS",e.SAFETY="SAFETY",e.RECITATION="RECITATION",e.LANGUAGE="LANGUAGE",e.OTHER="OTHER"}(d||(d={})),function(e){e.TASK_TYPE_UNSPECIFIED="TASK_TYPE_UNSPECIFIED",e.RETRIEVAL_QUERY="RETRIEVAL_QUERY",e.RETRIEVAL_DOCUMENT="RETRIEVAL_DOCUMENT",e.SEMANTIC_SIMILARITY="SEMANTIC_SIMILARITY",e.CLASSIFICATION="CLASSIFICATION",e.CLUSTERING="CLUSTERING"}(u||(u={})),function(e){e.MODE_UNSPECIFIED="MODE_UNSPECIFIED",e.AUTO="AUTO",e.ANY="ANY",e.NONE="NONE"}(h||(h={}));/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class O extends Error{constructor(e){super(`[GoogleGenerativeAI Error]: ${e}`)}}class N extends O{constructor(e,t){super(e),this.response=t}}class v extends O{constructor(e,t,n,s){super(e),this.status=t,this.statusText=n,this.errorDetails=s}}class A extends O{}!function(e){e.GENERATE_CONTENT="generateContent",e.STREAM_GENERATE_CONTENT="streamGenerateContent",e.COUNT_TOKENS="countTokens",e.EMBED_CONTENT="embedContent",e.BATCH_EMBED_CONTENTS="batchEmbedContents"}(f||(f={}));class T{constructor(e,t,n,s,o){this.model=e,this.task=t,this.apiKey=n,this.stream=s,this.requestOptions=o}toString(){var e,t;let n=(null===(e=this.requestOptions)||void 0===e?void 0:e.apiVersion)||"v1beta",s=(null===(t=this.requestOptions)||void 0===t?void 0:t.baseUrl)||"https://generativelanguage.googleapis.com",o=`${s}/${n}/${this.model}:${this.task}`;return this.stream&&(o+="?alt=sse"),o}}async function R(e){var t;let n=new Headers;n.append("Content-Type","application/json"),n.append("x-goog-api-client",function(e){let t=[];return(null==e?void 0:e.apiClient)&&t.push(e.apiClient),t.push("genai-js/0.15.0"),t.join(" ")}(e.requestOptions)),n.append("x-goog-api-key",e.apiKey);let s=null===(t=e.requestOptions)||void 0===t?void 0:t.customHeaders;if(s){if(!(s instanceof Headers))try{s=new Headers(s)}catch(e){throw new A(`unable to convert customHeaders value ${JSON.stringify(s)} to Headers: ${e.message}`)}for(let[e,t]of s.entries()){if("x-goog-api-key"===e)throw new A(`Cannot set reserved header name ${e}`);if("x-goog-api-client"===e)throw new A(`Header name ${e} can only be set using the apiClient field`);n.append(e,t)}}return n}async function S(e,t,n,s,o,i){let a=new T(e,t,n,s,i);return{url:a.toString(),fetchOptions:Object.assign(Object.assign({},function(e){let t={};if((null==e?void 0:e.timeout)>=0){let n=new AbortController,s=n.signal;setTimeout(()=>n.abort(),e.timeout),t.signal=s}return t}(i)),{method:"POST",headers:await R(a),body:o})}}async function I(e,t,n,s,o,i,a=fetch){let{url:r,fetchOptions:l}=await S(e,t,n,s,o,i);return w(r,l,a)}async function w(e,t,n=fetch){let s;try{s=await n(e,t)}catch(t){(function(e,t){let n=e;throw e instanceof v||e instanceof A||((n=new O(`Error fetching from ${t.toString()}: ${e.message}`)).stack=e.stack),n})(t,e)}return s.ok||await x(s,e),s}async function x(e,t){let n,s="";try{let t=await e.json();s=t.error.message,t.error.details&&(s+=` ${JSON.stringify(t.error.details)}`,n=t.error.details)}catch(e){}throw new v(`Error fetching from ${t.toString()}: [${e.status} ${e.statusText}] ${s}`,e.status,e.statusText,n)}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function b(e){return e.text=()=>{if(e.candidates&&e.candidates.length>0){if(e.candidates.length>1&&console.warn(`This response had ${e.candidates.length} candidates. Returning text from the first candidate only. Access response.candidates directly to use the other candidates.`),D(e.candidates[0]))throw new N(`${P(e)}`,e);return function(e){var t,n,s,o;let i=[];if(null===(n=null===(t=e.candidates)||void 0===t?void 0:t[0].content)||void 0===n?void 0:n.parts)for(let t of null===(o=null===(s=e.candidates)||void 0===s?void 0:s[0].content)||void 0===o?void 0:o.parts)t.text&&i.push(t.text),t.executableCode&&i.push("\n```python\n"+t.executableCode.code+"\n```\n"),t.codeExecutionResult&&i.push("\n```\n"+t.codeExecutionResult.output+"\n```\n");return i.length>0?i.join(""):""}(e)}if(e.promptFeedback)throw new N(`Text not available. ${P(e)}`,e);return""},e.functionCall=()=>{if(e.candidates&&e.candidates.length>0){if(e.candidates.length>1&&console.warn(`This response had ${e.candidates.length} candidates. Returning function calls from the first candidate only. Access response.candidates directly to use the other candidates.`),D(e.candidates[0]))throw new N(`${P(e)}`,e);return console.warn("response.functionCall() is deprecated. Use response.functionCalls() instead."),L(e)[0]}if(e.promptFeedback)throw new N(`Function call not available. ${P(e)}`,e)},e.functionCalls=()=>{if(e.candidates&&e.candidates.length>0){if(e.candidates.length>1&&console.warn(`This response had ${e.candidates.length} candidates. Returning function calls from the first candidate only. Access response.candidates directly to use the other candidates.`),D(e.candidates[0]))throw new N(`${P(e)}`,e);return L(e)}if(e.promptFeedback)throw new N(`Function call not available. ${P(e)}`,e)},e}function L(e){var t,n,s,o;let i=[];if(null===(n=null===(t=e.candidates)||void 0===t?void 0:t[0].content)||void 0===n?void 0:n.parts)for(let t of null===(o=null===(s=e.candidates)||void 0===s?void 0:s[0].content)||void 0===o?void 0:o.parts)t.functionCall&&i.push(t.functionCall);return i.length>0?i:void 0}let M=[d.RECITATION,d.SAFETY,d.LANGUAGE];function D(e){return!!e.finishReason&&M.includes(e.finishReason)}function P(e){var t,n,s;let o="";if((!e.candidates||0===e.candidates.length)&&e.promptFeedback)o+="Response was blocked",(null===(t=e.promptFeedback)||void 0===t?void 0:t.blockReason)&&(o+=` due to ${e.promptFeedback.blockReason}`),(null===(n=e.promptFeedback)||void 0===n?void 0:n.blockReasonMessage)&&(o+=`: ${e.promptFeedback.blockReasonMessage}`);else if(null===(s=e.candidates)||void 0===s?void 0:s[0]){let t=e.candidates[0];D(t)&&(o+=`Candidate was blocked due to ${t.finishReason}`,t.finishMessage&&(o+=`: ${t.finishMessage}`))}return o}function U(e){return this instanceof U?(this.v=e,this):new U(e)}"function"==typeof SuppressedError&&SuppressedError;/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let H=/^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;async function G(e){let t=[],n=e.getReader();for(;;){let{done:e,value:s}=await n.read();if(e)return b(function(e){let t=e[e.length-1],n={promptFeedback:null==t?void 0:t.promptFeedback};for(let t of e){if(t.candidates)for(let e of t.candidates){let t=e.index;if(n.candidates||(n.candidates=[]),n.candidates[t]||(n.candidates[t]={index:e.index}),n.candidates[t].citationMetadata=e.citationMetadata,n.candidates[t].finishReason=e.finishReason,n.candidates[t].finishMessage=e.finishMessage,n.candidates[t].safetyRatings=e.safetyRatings,e.content&&e.content.parts){n.candidates[t].content||(n.candidates[t].content={role:e.content.role||"user",parts:[]});let s={};for(let o of e.content.parts)o.text&&(s.text=o.text),o.functionCall&&(s.functionCall=o.functionCall),o.executableCode&&(s.executableCode=o.executableCode),o.codeExecutionResult&&(s.codeExecutionResult=o.codeExecutionResult),0===Object.keys(s).length&&(s.text=""),n.candidates[t].content.parts.push(s)}}t.usageMetadata&&(n.usageMetadata=t.usageMetadata)}return n}(t));t.push(s)}}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function F(e,t,n,s){return function(e){let[t,n]=(function(e){let t=e.getReader();return new ReadableStream({start(e){let n="";return function s(){return t.read().then(({value:t,done:o})=>{let i;if(o){if(n.trim()){e.error(new O("Failed to parse stream"));return}e.close();return}let a=(n+=t).match(H);for(;a;){try{i=JSON.parse(a[1])}catch(t){e.error(new O(`Error parsing JSON response: "${a[1]}"`));return}e.enqueue(i),a=(n=n.substring(a[0].length)).match(H)}return s()})}()}})})(e.body.pipeThrough(new TextDecoderStream("utf8",{fatal:!0}))).tee();return{stream:function(e){return function(e,t,n){if(!Symbol.asyncIterator)throw TypeError("Symbol.asyncIterator is not defined.");var s,o=n.apply(e,t||[]),i=[];return s={},a("next"),a("throw"),a("return"),s[Symbol.asyncIterator]=function(){return this},s;function a(e){o[e]&&(s[e]=function(t){return new Promise(function(n,s){i.push([e,t,n,s])>1||r(e,t)})})}function r(e,t){try{var n;(n=o[e](t)).value instanceof U?Promise.resolve(n.value.v).then(l,c):d(i[0][2],n)}catch(e){d(i[0][3],e)}}function l(e){r("next",e)}function c(e){r("throw",e)}function d(e,t){e(t),i.shift(),i.length&&r(i[0][0],i[0][1])}}(this,arguments,function*(){let t=e.getReader();for(;;){let{value:e,done:n}=yield U(t.read());if(n)break;yield yield U(b(e))}})}(t),response:G(n)}}(await I(t,f.STREAM_GENERATE_CONTENT,e,!0,JSON.stringify(n),s))}async function $(e,t,n,s){let o=await I(t,f.GENERATE_CONTENT,e,!1,JSON.stringify(n),s);return{response:b(await o.json())}}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function B(e){if(null!=e){if("string"==typeof e)return{role:"system",parts:[{text:e}]};if(e.text)return{role:"system",parts:[e]};if(e.parts)return e.role?e:{role:"system",parts:e.parts}}}function j(e){let t=[];if("string"==typeof e)t=[{text:e}];else for(let n of e)"string"==typeof n?t.push({text:n}):t.push(n);return function(e){let t={role:"user",parts:[]},n={role:"function",parts:[]},s=!1,o=!1;for(let i of e)"functionResponse"in i?(n.parts.push(i),o=!0):(t.parts.push(i),s=!0);if(s&&o)throw new O("Within a single message, FunctionResponse cannot be mixed with other type of part in the request for sending chat message.");if(!s&&!o)throw new O("No content is provided for sending chat message.");return s?t:n}(t)}function K(e){let t;return t=e.contents?e:{contents:[j(e)]},e.systemInstruction&&(t.systemInstruction=B(e.systemInstruction)),t}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Y=["text","inlineData","functionCall","functionResponse","executableCode","codeExecutionResult"],k={user:["text","inlineData"],function:["functionResponse"],model:["text","functionCall","executableCode","codeExecutionResult"],system:["text"]},q="SILENT_ERROR";class J{constructor(e,t,n,s){this.model=t,this.params=n,this.requestOptions=s,this._history=[],this._sendPromise=Promise.resolve(),this._apiKey=e,(null==n?void 0:n.history)&&(function(e){let t=!1;for(let n of e){let{role:e,parts:s}=n;if(!t&&"user"!==e)throw new O(`First content should be with role 'user', got ${e}`);if(!_.includes(e))throw new O(`Each item should include role field. Got ${e} but valid roles are: ${JSON.stringify(_)}`);if(!Array.isArray(s))throw new O("Content should have 'parts' property with an array of Parts");if(0===s.length)throw new O("Each Content should have at least one part");let o={text:0,inlineData:0,functionCall:0,functionResponse:0,fileData:0,executableCode:0,codeExecutionResult:0};for(let e of s)for(let t of Y)t in e&&(o[t]+=1);let i=k[e];for(let t of Y)if(!i.includes(t)&&o[t]>0)throw new O(`Content with role '${e}' can't contain '${t}' part`);t=!0}}(n.history),this._history=n.history)}async getHistory(){return await this._sendPromise,this._history}async sendMessage(e){var t,n,s,o,i,a;let r;await this._sendPromise;let l=j(e),c={safetySettings:null===(t=this.params)||void 0===t?void 0:t.safetySettings,generationConfig:null===(n=this.params)||void 0===n?void 0:n.generationConfig,tools:null===(s=this.params)||void 0===s?void 0:s.tools,toolConfig:null===(o=this.params)||void 0===o?void 0:o.toolConfig,systemInstruction:null===(i=this.params)||void 0===i?void 0:i.systemInstruction,cachedContent:null===(a=this.params)||void 0===a?void 0:a.cachedContent,contents:[...this._history,l]};return this._sendPromise=this._sendPromise.then(()=>$(this._apiKey,this.model,c,this.requestOptions)).then(e=>{var t;if(e.response.candidates&&e.response.candidates.length>0){this._history.push(l);let n=Object.assign({parts:[],role:"model"},null===(t=e.response.candidates)||void 0===t?void 0:t[0].content);this._history.push(n)}else{let t=P(e.response);t&&console.warn(`sendMessage() was unsuccessful. ${t}. Inspect response object for details.`)}r=e}),await this._sendPromise,r}async sendMessageStream(e){var t,n,s,o,i,a;await this._sendPromise;let r=j(e),l={safetySettings:null===(t=this.params)||void 0===t?void 0:t.safetySettings,generationConfig:null===(n=this.params)||void 0===n?void 0:n.generationConfig,tools:null===(s=this.params)||void 0===s?void 0:s.tools,toolConfig:null===(o=this.params)||void 0===o?void 0:o.toolConfig,systemInstruction:null===(i=this.params)||void 0===i?void 0:i.systemInstruction,cachedContent:null===(a=this.params)||void 0===a?void 0:a.cachedContent,contents:[...this._history,r]},c=F(this._apiKey,this.model,l,this.requestOptions);return this._sendPromise=this._sendPromise.then(()=>c).catch(e=>{throw Error(q)}).then(e=>e.response).then(e=>{if(e.candidates&&e.candidates.length>0){this._history.push(r);let t=Object.assign({},e.candidates[0].content);t.role||(t.role="model"),this._history.push(t)}else{let t=P(e);t&&console.warn(`sendMessageStream() was unsuccessful. ${t}. Inspect response object for details.`)}}).catch(e=>{e.message!==q&&console.error(e)}),c}}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function X(e,t,n,s){return(await I(t,f.COUNT_TOKENS,e,!1,JSON.stringify(n),s)).json()}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function V(e,t,n,s){return(await I(t,f.EMBED_CONTENT,e,!1,JSON.stringify(n),s)).json()}async function W(e,t,n,s){let o=n.requests.map(e=>Object.assign(Object.assign({},e),{model:t}));return(await I(t,f.BATCH_EMBED_CONTENTS,e,!1,JSON.stringify({requests:o}),s)).json()}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class z{constructor(e,t,n){this.apiKey=e,t.model.includes("/")?this.model=t.model:this.model=`models/${t.model}`,this.generationConfig=t.generationConfig||{},this.safetySettings=t.safetySettings||[],this.tools=t.tools,this.toolConfig=t.toolConfig,this.systemInstruction=B(t.systemInstruction),this.cachedContent=t.cachedContent,this.requestOptions=n||{}}async generateContent(e){var t;let n=K(e);return $(this.apiKey,this.model,Object.assign({generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,cachedContent:null===(t=this.cachedContent)||void 0===t?void 0:t.name},n),this.requestOptions)}async generateContentStream(e){var t;let n=K(e);return F(this.apiKey,this.model,Object.assign({generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,cachedContent:null===(t=this.cachedContent)||void 0===t?void 0:t.name},n),this.requestOptions)}startChat(e){var t;return new J(this.apiKey,this.model,Object.assign({generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,cachedContent:null===(t=this.cachedContent)||void 0===t?void 0:t.name},e),this.requestOptions)}async countTokens(e){let t=function(e,t){var n;let s={model:null==t?void 0:t.model,generationConfig:null==t?void 0:t.generationConfig,safetySettings:null==t?void 0:t.safetySettings,tools:null==t?void 0:t.tools,toolConfig:null==t?void 0:t.toolConfig,systemInstruction:null==t?void 0:t.systemInstruction,cachedContent:null===(n=null==t?void 0:t.cachedContent)||void 0===n?void 0:n.name,contents:[]},o=null!=e.generateContentRequest;if(e.contents){if(o)throw new A("CountTokensRequest must have one of contents or generateContentRequest, not both.");s.contents=e.contents}else if(o)s=Object.assign(Object.assign({},s),e.generateContentRequest);else{let t=j(e);s.contents=[t]}return{generateContentRequest:s}}(e,{model:this.model,generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,cachedContent:this.cachedContent});return X(this.apiKey,this.model,t,this.requestOptions)}async embedContent(e){let t="string"==typeof e||Array.isArray(e)?{content:j(e)}:e;return V(this.apiKey,this.model,t,this.requestOptions)}async batchEmbedContents(e){return W(this.apiKey,this.model,e,this.requestOptions)}}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Q{constructor(e){this.apiKey=e}getGenerativeModel(e,t){if(!e.model)throw new O("Must provide a model name. Example: genai.getGenerativeModel({ model: 'my-model-name' })");return new z(this.apiKey,e,t)}getGenerativeModelFromCachedContent(e,t){if(!e.name)throw new A("Cached content must contain a `name` field.");if(!e.model)throw new A("Cached content must contain a `model` field.");let n={model:e.model,tools:e.tools,toolConfig:e.toolConfig,systemInstruction:e.systemInstruction,cachedContent:e};return new z(this.apiKey,n,t)}}let Z=new Q(process.env.GEMINI_API_KEY),ee=`
You are a data extraction assistant for a class/event check-in app.

Analyze this image (which may be a photo of a paper roster, a printed list, a spreadsheet screenshot, or a computer screen) and extract ALL student or participant names plus any accompanying columns of data.

Return ONLY valid JSON in this exact shape — no markdown fences, no explanation:
{
  "names": ["Full Name 1", "Full Name 2", ...],
  "detected_columns": [
    {
      "header": "column header as it appears",
      "sample_values": ["val1", "val2", "val3"],
      "suggested_mapping": "one of: Name | Guardian Phone | Age | Allergies | Pickup Location | Drop-off Location | Special Needs | Notes | (Ignore)",
      "confidence": 0-100
    }
  ],
  "raw_text": "all text you can read from the image, verbatim"
}

Rules:
- Always include a "Name" column in detected_columns (confidence 99).
- Extract every visible column, not just names.
- If the list is numbered, strip the number from the name.
- Normalize names to "First Last" format where possible.
- Keep suggested_mapping simple — pick the closest match from the allowed values.
- confidence is your certainty 0-100 that the suggested_mapping is correct.
`.trim();async function et(e,t){let n=Z.getGenerativeModel({model:"gemini-1.5-pro",safetySettings:[{category:a.HARM_CATEGORY_HARASSMENT,threshold:r.BLOCK_NONE},{category:a.HARM_CATEGORY_HATE_SPEECH,threshold:r.BLOCK_NONE},{category:a.HARM_CATEGORY_DANGEROUS_CONTENT,threshold:r.BLOCK_NONE},{category:a.HARM_CATEGORY_SEXUALLY_EXPLICIT,threshold:r.BLOCK_NONE}]}),s=(await n.generateContent([ee,{inlineData:{data:e,mimeType:t}}])).response.text().trim(),o=s.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();try{let e=JSON.parse(o);return Array.isArray(e.names)||(e.names=[]),Array.isArray(e.detected_columns)||(e.detected_columns=[]),e.raw_text||(e.raw_text=""),e}catch(e){throw Error(`Gemini returned non-JSON response: ${s.slice(0,200)}`)}}async function en(e){let t=Z.getGenerativeModel({model:"gemini-1.5-flash"}),n=`
Parse this plain text roster and return JSON in this exact shape with no markdown fences:
{
  "names": ["Full Name 1", ...],
  "detected_columns": [...],
  "raw_text": "${e.slice(0,2e3)}"
}
Same rules as before — extract names and any column data you can identify.

Text to parse:
${e}
  `.trim(),s=(await t.generateContent(n)).response.text().trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();try{return JSON.parse(s)}catch{return{names:e.split("\n").map(e=>e.trim()).filter(Boolean),detected_columns:[],raw_text:e}}}var es=n(1330);let eo="nodejs",ei=60;async function ea(e){let t;let n=(0,y.e)(),{data:{user:s},error:o}=await n.auth.getUser();if(!s||o)return C.NextResponse.json({error:"Unauthorized"},{status:401});let{data:i}=await n.from("profiles").select("org_id, plan_tier").eq("id",s.id).single();if(!i)return C.NextResponse.json({error:"Profile not found"},{status:404});let{count:a}=await n.from("checkin_lists").select("*",{count:"exact",head:!0}).eq("org_id",i.org_id).eq("archived",!1),r=(0,es.bj)(i.plan_tier,a??0);if(!r.allowed)return C.NextResponse.json({error:r.reason,code:"PLAN_LIMIT"},{status:402});if((e.headers.get("content-type")??"").includes("multipart/form-data")){let n=(await e.formData()).get("file");if(!n)return C.NextResponse.json({error:"No file provided"},{status:400});let s=await n.arrayBuffer(),o=Buffer.from(s).toString("base64"),i=n.type;if("text/csv"===n.type||"text/plain"===n.type){let e=await n.text();t=await en(e)}else t=await et(o,i)}else{let n=await e.json();if(n.text)t=await en(n.text);else{if(!n.base64||!n.mimeType)return C.NextResponse.json({error:"Invalid request body"},{status:400});t=await et(n.base64,n.mimeType)}}return C.NextResponse.json({success:!0,data:t})}let er=new m.AppRouteRouteModule({definition:{kind:g.x.APP_ROUTE,page:"/api/upload/route",pathname:"/api/upload",filename:"route",bundlePath:"app/api/upload/route"},resolvedPagePath:"/Users/davidsparrow/Documents/_appDevelopment/Dev/herder/src/app/api/upload/route.ts",nextConfigOutput:"",userland:p}),{requestAsyncStorage:el,staticGenerationAsyncStorage:ec,serverHooks:ed}=er,eu="/api/upload/route";function eh(){return(0,E.patchFetch)({serverHooks:ed,staticGenerationAsyncStorage:ec})}},1330:(e,t,n)=>{n.d(t,{U6:()=>i,Xf:()=>s,bj:()=>o});let s={free:{name:"Free",price:"$0 / mo",maxLists:3,maxNamesPerList:20,customColumns:!1,notifications:!0,qrCodes:!1,analytics:!1,description:"Perfect for trying Herder with a single class.",badge:"\uD83D\uDC11"},standard:{name:"Standard",price:"$12 / mo",maxLists:null,maxNamesPerList:null,customColumns:!0,notifications:!1,qrCodes:!0,analytics:!0,description:"Unlimited lists and custom columns for active teachers.",badge:"\uD83D\uDC04"},pro:{name:"Pro",price:"$29 / mo",maxLists:null,maxNamesPerList:null,customColumns:!0,notifications:!0,qrCodes:!0,analytics:!0,description:"Full power: SMS/email notifications + everything in Standard.",badge:"\uD83E\uDDAC"}};function o(e,t){let n=s[e];return null===n.maxLists?{allowed:!0}:t>=n.maxLists?{allowed:!1,reason:`Free plan is limited to ${n.maxLists} lists. Upgrade to create more.`}:{allowed:!0}}function i(e,t){return!!s[e][t]}},5655:(e,t,n)=>{n.d(t,{e:()=>i});var s=n(3647),o=n(1615);function i(){let e=(0,o.cookies)();return(0,s.lx)(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>e.getAll(),setAll(t){try{t.forEach(({name:t,value:n,options:s})=>e.set(t,n,s))}catch{}}}})}}};var t=require("../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),s=t.X(0,[276,111,972],()=>n(3055));module.exports=s})();