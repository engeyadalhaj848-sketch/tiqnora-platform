import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/service_models.dart';
import 'service_providers.dart';

class CreateRequestScreen extends ConsumerStatefulWidget {
  const CreateRequestScreen({super.key});

  @override
  ConsumerState<CreateRequestScreen> createState() =>
      _CreateRequestScreenState();
}

class _CreateRequestScreenState extends ConsumerState<CreateRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descController = TextEditingController();
  final _titleController = TextEditingController();
  String? _selectedType;

  @override
  void dispose() {
    _descController.dispose();
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedType == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('اختر نوع الخدمة')),
      );
      return;
    }

    final ok = await ref.read(createServiceRequestProvider.notifier).submit(
          serviceType: _selectedType!,
          description: _descController.text.trim(),
          title: _titleController.text.trim().isEmpty
              ? null
              : _titleController.text.trim(),
        );

    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال الطلب بنجاح')),
      );
      Navigator.of(context).pop(true);
    } else {
      final err = ref.read(createServiceRequestProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            err.hasError ? 'فشل الإرسال: ${err.error}' : 'فشل إرسال الطلب',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final submitting = ref.watch(createServiceRequestProvider).isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('طلب خدمة جديد')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'نوع الخدمة',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: serviceTypes.map((t) {
                final selected = _selectedType == t;
                return ChoiceChip(
                  label: Text(t),
                  selected: selected,
                  onSelected: (_) => setState(() => _selectedType = t),
                  selectedColor: AppColors.primary.withValues(alpha: 0.2),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'عنوان الطلب (اختياري)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _descController,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'وصف الطلب *',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
                hintText: 'اشرح ما تحتاجه بالتفصيل...',
              ),
              validator: (v) {
                if (v == null || v.trim().length < 10) {
                  return 'اكتب وصفاً أوضح (10 أحرف على الأقل)';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            Card(
              color: AppColors.primary.withValues(alpha: 0.06),
              child: const ListTile(
                leading: Icon(Icons.attach_file),
                title: Text('المرفقات'),
                subtitle: Text('سيتم دعم رفع الملفات في مرحلة لاحقة'),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: submitting ? null : _submit,
              child: submitting
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('إرسال الطلب'),
            ),
          ],
        ),
      ),
    );
  }
}
