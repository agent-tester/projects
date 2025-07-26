from flask import Flask, request, jsonify, render_template
from rich import print_json
import requests
import yaml
import re
import random
from pathlib import Path

app = Flask(__name__)

CONFIG_PATH = Path(__file__).parent / "config.yaml"
def load_config():
    with open(CONFIG_PATH, 'r') as f:
        return yaml.safe_load(f)

config = load_config()
DEFAULT_API_BASE = config["api"]["base"]
DEFAULT_MODEL = config["api"]["model"]
DEFAULT_SETTINGS = config["defaults"]
ANALYSIS_SETTINGS = config["analysis"]
PROMPTS = config["prompts"]
SAMPLE_PERSONAS = config["sample_personas"]
DEFAULT_CONTEXT = config["default_context"]

def extract_params_from_prompt(prompt):
    creativity = float(re.search(r"\[CREATIVITY:(.*?)\]", prompt).group(1)) if "[CREATIVITY:" in prompt else DEFAULT_SETTINGS["temperature"]
    max_length = int(re.search(r"\[MAX_LENGTH:(.*?)\]", prompt).group(1)) if "[MAX_LENGTH:" in prompt else DEFAULT_SETTINGS["max_tokens"]
    prompt = re.sub(r"\[CREATIVITY:.*?\]", "", prompt)
    prompt = re.sub(r"\[MAX_LENGTH:.*?\]", "", prompt)
    return prompt.strip(), creativity, max_length

def format_conversation(conversation, target_persona):
    messages = []
    for line in conversation.split('\n'):
        if ':' in line:
            speaker, message = line.split(':', 1)
            role = "assistant" if speaker.strip() == target_persona else "user"
            messages.append({"role": role, "content": f"{speaker.strip()}: {message.strip()}"})
    return messages if messages else [{"role": "user", "content": "[Conversation starts here.]"}]

def build_chat_payload(persona, system_prompt, context, conversation, temperature, max_tokens, persona_params=None):
    full_prompt = f"[CONTEXT]: {context}\n\n[PERSONA]: {system_prompt}"
    messages = [{"role": "system", "content": full_prompt}]
    messages.extend(format_conversation(conversation, persona))
    
    if persona_params and 'modal_params' in persona_params:
        modal_params = persona_params['modal_params']
        temperature = modal_params.get('temperature', temperature)
        max_tokens = modal_params.get('max_tokens', max_tokens)
    
    return {
        "model": DEFAULT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": DEFAULT_SETTINGS["top_p"],
        "frequency_penalty": DEFAULT_SETTINGS["frequency_penalty"],
        "presence_penalty": DEFAULT_SETTINGS["presence_penalty"],
        "stop": DEFAULT_SETTINGS["stop"]
    }

def get_persona_config(persona_name):
    for persona in SAMPLE_PERSONAS:
        if persona['name'] == persona_name:
            return persona
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/config', methods=['GET'])
def get_config():
    return jsonify({
        "sample_personas": SAMPLE_PERSONAS,
        "default_context": DEFAULT_CONTEXT
    })

@app.route('/analyze', methods=['POST'])
def analyze_conversation():
    data = request.get_json()
    try:
        prompt = PROMPTS["analysis_system"].format(
            context=data.get('context', ''),
            conversation=data['conversation'],
            questions=data['analysis_prompt']
        )
        payload = {"model": DEFAULT_MODEL, "prompt": prompt, **ANALYSIS_SETTINGS}
        print("\nANALYSIS\n"); print_json(data=payload)

        response = requests.post(f"{DEFAULT_API_BASE}/completions", json=payload)
        response.raise_for_status()
        text = response.json().get("choices", [{}])[0].get("text", "").strip()
        return jsonify({"analysis": text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    prompt, temperature, max_tokens = extract_params_from_prompt(data['system_prompt'])
    
    persona_config = get_persona_config(data['persona'])
    
    payload = build_chat_payload(
        data['persona'],
        prompt,
        data['context'],
        data['conversation'],
        temperature,
        max_tokens,
        persona_config
    )
    print("\nCHAT\n"); print_json(data=payload)

    try:
        response = requests.post(f"{DEFAULT_API_BASE}/chat/completions", json=payload)
        response.raise_for_status()
        message = response.json()['choices'][0]['message']['content']
        if message.startswith(f"{data['persona']}:"):
            message = message[len(data['persona'])+1:].strip()
        return jsonify({"response": message})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/auto_chat', methods=['POST'])
def auto_chat():
    data = request.get_json()
    context, conversation, personas = data['context'], data['conversation'], data['personas']
    turns, random_order = data.get('turns', 1), data.get('random', False)
    current_convo = conversation or f"[The conversation begins with this context: {context}]"
    results = []

    def determine_responders():
        prompt = PROMPTS["conversation_flow"].format(
            context=context,
            history=current_convo,
            characters=", ".join([p["name"] for p in personas])
        )
        try:
            res = requests.post(
                f"{DEFAULT_API_BASE}/chat/completions",
                json={
                    "model": DEFAULT_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a conversation flow analyzer."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 100
                }
            )
            decision = res.json()['choices'][0]['message']['content'].strip().lower()
            return [] if decision == "none" else [p for p in personas if p['name'].lower() in decision]
        except:
            return personas

    try:
        for _ in range(turns):
            turn_personas = personas.copy()
            if random_order:
                turn_personas = determine_responders() if random.random() > 0.5 else random.sample(personas, len(personas))

            for p in turn_personas:
                payload = {
                    "persona": p['name'],
                    "system_prompt": p['system_prompt'],
                    "context": context,
                    "conversation": re.sub(r'\[.*?\]', '', current_convo)
                }
                port = request.environ.get('SERVER_PORT', 5000)
                res = requests.post(f"http://localhost:{port}/chat", json=payload)
                msg = res.json()['response']
                current_convo += f"\n{p['name']}: {msg}"
                print(f"\n>>>{p['name']}: {msg}")
                results.append({"persona": p['name'], "message": msg})
        return jsonify({"conversation": current_convo, "exchanges": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/direct_chat', methods=['POST'])
def direct_chat():
    data = request.get_json()
    try:
        sender, receiver, message = data['sender'], data['receiver'], data['message']
        context = f"{data['context']}\n\n[This is a direct message from {sender['name']} to you]"
        conversation = data.get('conversation', '') + f"\n{sender['name']}: {message}"

        payload = {
            "persona": receiver['name'],
            "system_prompt": receiver.get('system_prompt', receiver.get('prompt', '')),
            "context": context,
            "conversation": conversation
        }

        url = f"{request.host_url.rstrip('/')}/chat"
        response = requests.post(url, json=payload)
        return jsonify({
            "message": response.json()['response'],
            "sender": sender['name'],
            "receiver": receiver['name']
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)