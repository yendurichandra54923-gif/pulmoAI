"""
PulmoAI Model Diagnostic Script
================================
Checks model architecture, class ordering, and preprocessing to find
why predictions always output the same class.
"""
import tensorflow as tf
from tensorflow.keras.models import load_model
import numpy as np
from PIL import Image
import os, glob

MODEL_PATH = "models/proposed_ensemble_model.keras"
DATASET_ROOT = "dataset/Balanced_Dataset"

print("=" * 60)
print("  PULMOAI — MODEL DIAGNOSTIC")
print("=" * 60)

# 1. Load model
model = load_model(MODEL_PATH)
print(f"\n[1] Model Input Shape  : {model.input_shape}")
print(f"    Model Output Shape : {model.output_shape}")
print(f"    Number of classes  : {model.output_shape[-1]}")

# 2. Check output layer activation
last_layer = model.layers[-1]
print(f"\n[2] Last Layer Name    : {last_layer.name}")
print(f"    Last Layer Type    : {type(last_layer).__name__}")
if hasattr(last_layer, 'activation'):
    print(f"    Activation         : {last_layer.activation.__name__}")

# 3. Check training class order from dataset folder names
class_folders = sorted(os.listdir(DATASET_ROOT))
print(f"\n[3] Dataset Folders (alphabetical = typical training order):")
for i, name in enumerate(class_folders):
    print(f"    Index {i} -> {name}")

# 4. Test with one image from EACH class using /255.0 preprocessing
print(f"\n[4] Testing inference with /255.0 normalization:")
print("-" * 60)

for cls_folder in class_folders:
    cls_path = os.path.join(DATASET_ROOT, cls_folder)
    images = glob.glob(os.path.join(cls_path, "*.*"))
    if not images:
        continue
    
    test_img_path = images[0]
    img = Image.open(test_img_path).convert("RGB").resize((224, 224))
    img_arr = np.array(img, dtype=np.float32) / 255.0
    img_arr = np.expand_dims(img_arr, axis=0)
    
    preds = model.predict(img_arr, verbose=0)[0]
    pred_idx = int(np.argmax(preds))
    
    print(f"\n  Source Folder : {cls_folder}")
    print(f"  Image        : {os.path.basename(test_img_path)}")
    print(f"  Raw Output   : {preds}")
    print(f"  Sum of preds : {preds.sum():.4f}")
    print(f"  Predicted Idx: {pred_idx}  (confidence: {preds[pred_idx]:.4f})")
    
    # Also check softmax applied
    if not np.isclose(preds.sum(), 1.0, atol=0.05):
        sm = tf.nn.softmax(preds).numpy()
        sm_idx = int(np.argmax(sm))
        print(f"  After Softmax: {sm}")
        print(f"  Softmax Idx  : {sm_idx}  (confidence: {sm[sm_idx]:.4f})")

# 5. Try with ImageNet-style preprocessing
print(f"\n\n[5] Testing with tf.keras.applications preprocessing:")
print("-" * 60)

from tensorflow.keras.applications.resnet50 import preprocess_input as resnet_preprocess
from tensorflow.keras.applications.efficientnet import preprocess_input as effnet_preprocess

for preprocess_fn, name in [(resnet_preprocess, "ResNet50"), (effnet_preprocess, "EfficientNet")]:
    test_img_path = glob.glob(os.path.join(DATASET_ROOT, "Normal", "*.*"))[0]
    img = Image.open(test_img_path).convert("RGB").resize((224, 224))
    img_arr = np.array(img, dtype=np.float32)
    img_arr = np.expand_dims(img_arr, axis=0)
    img_arr = preprocess_fn(img_arr)
    
    preds = model.predict(img_arr, verbose=0)[0]
    pred_idx = int(np.argmax(preds))
    
    print(f"\n  Preprocessing: {name}")
    print(f"  Raw Output   : {preds}")
    print(f"  Sum of preds : {preds.sum():.4f}")
    print(f"  Predicted Idx: {pred_idx}  (confidence: {preds[pred_idx]:.4f})")
    
    if not np.isclose(preds.sum(), 1.0, atol=0.05):
        sm = tf.nn.softmax(preds).numpy()
        sm_idx = int(np.argmax(sm))
        print(f"  After Softmax: {sm}")
        print(f"  Softmax Idx  : {sm_idx}  (confidence: {sm[sm_idx]:.4f})")

print("\n" + "=" * 60)
print("  DIAGNOSTIC COMPLETE")
print("=" * 60)
